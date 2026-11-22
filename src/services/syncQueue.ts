import { db } from '../db/posDb';
import type {
  Customer,
  Expense,
  Product,
  Sale,
  Shift,
  StockTransfer,
  SupplierQuote,
  SyncEntityType,
  SyncOperationType,
  SyncQueueItem,
} from '../types/pos';

export interface PendingSyncSummary {
  total: number;
  pendingSales: number;
  pendingShifts: number;
  pendingTransfers: number;
  pendingExpenses: number;
  pendingOther: number;
  pendingQueueItems: number;
}

export interface SyncProcessResult {
  ok: boolean;
  syncedCount: number;
  syncedAt: string | null;
  reason?: 'offline' | 'empty';
  breakdown: {
    sales: number;
    shifts: number;
    stockTransfers: number;
    expenses: number;
    other: number;
  };
}

export function buildSyncQueueItem(params: {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  summary: string;
  timestamp?: string;
}): SyncQueueItem {
  const now = params.timestamp || new Date().toISOString();
  return {
    id: `sync-${params.entityType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entityType: params.entityType,
    entityId: params.entityId,
    operation: params.operation,
    summary: params.summary,
    timestamp: now,
    syncStatus: 'pending',
    syncedAt: undefined,
  };
}

export async function enqueueSyncOperation(params: {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  summary: string;
  timestamp?: string;
}): Promise<SyncQueueItem> {
  const item = buildSyncQueueItem(params);
  await db.syncQueue.put(item);
  return item;
}

export function computePendingSyncSummary(params: {
  sales: Sale[];
  shifts: Shift[];
  transfers: StockTransfer[];
  expenses: Expense[];
  customers: Customer[];
  products: Product[];
  supplierQuotes: SupplierQuote[];
  syncQueue: SyncQueueItem[];
}): PendingSyncSummary {
  const pendingSales = params.sales.filter((s) => s.syncStatus === 'pending').length;
  const pendingShifts = params.shifts.filter((s) => s.syncStatus === 'pending').length;
  const pendingTransfers = params.transfers.filter((t) => t.syncStatus === 'pending').length;
  const pendingExpenses = params.expenses.filter((e) => e.syncStatus === 'pending').length;
  const pendingCustomers = params.customers.filter((c) => c.syncStatus === 'pending').length;
  const pendingQuotes = params.supplierQuotes.filter((q) => q.syncStatus === 'pending').length;
  const pendingQueueItems = params.syncQueue.filter((q) => q.syncStatus === 'pending').length;

  // Include delete operations tracked solely in syncQueue plus customer/quote/product updates
  const pendingDeleteOps = params.syncQueue.filter(
    (q) => q.syncStatus === 'pending' && q.operation === 'delete'
  ).length;
  const pendingProductPriceOps = params.syncQueue.filter(
    (q) => q.syncStatus === 'pending' && q.entityType === 'product'
  ).length;

  const pendingOther = pendingCustomers + pendingQuotes + pendingDeleteOps + pendingProductPriceOps;
  const domainPendingTotal =
    pendingSales + pendingShifts + pendingTransfers + pendingExpenses + pendingOther;

  return {
    total: Math.max(domainPendingTotal, pendingQueueItems),
    pendingSales,
    pendingShifts,
    pendingTransfers,
    pendingExpenses,
    pendingOther,
    pendingQueueItems,
  };
}

export async function processSyncQueue(): Promise<SyncProcessResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      syncedCount: 0,
      syncedAt: null,
      reason: 'offline',
      breakdown: { sales: 0, shifts: 0, stockTransfers: 0, expenses: 0, other: 0 },
    };
  }

  const now = new Date().toISOString();

  const [
    pendingSales,
    pendingShifts,
    pendingTransfers,
    pendingExpenses,
    pendingCustomers,
    pendingProducts,
    pendingBranches,
    pendingQuotes,
    pendingQueue,
  ] = await Promise.all([
    db.sales.where('syncStatus').equals('pending').toArray(),
    db.shifts.where('syncStatus').equals('pending').toArray(),
    db.stockTransfers.where('syncStatus').equals('pending').toArray(),
    db.expenses.where('syncStatus').equals('pending').toArray(),
    db.customers.where('syncStatus').equals('pending').toArray(),
    db.products.where('syncStatus').equals('pending').toArray(),
    db.branches.where('syncStatus').equals('pending').toArray(),
    db.supplierQuotes.where('syncStatus').equals('pending').toArray(),
    db.syncQueue.where('syncStatus').equals('pending').toArray(),
  ]);

  const totalDbRecords =
    pendingSales.length +
    pendingShifts.length +
    pendingTransfers.length +
    pendingExpenses.length +
    pendingCustomers.length +
    pendingProducts.length +
    pendingBranches.length +
    pendingQuotes.length +
    pendingQueue.length;

  if (totalDbRecords === 0) {
    return {
      ok: true,
      syncedCount: 0,
      syncedAt: now,
      reason: 'empty',
      breakdown: { sales: 0, shifts: 0, stockTransfers: 0, expenses: 0, other: 0 },
    };
  }

  await db.transaction(
    'rw',
    [
      db.sales,
      db.shifts,
      db.stockTransfers,
      db.expenses,
      db.customers,
      db.products,
      db.branches,
      db.supplierQuotes,
      db.syncQueue,
      db.settings,
    ],
    async () => {
      await Promise.all([
        ...pendingSales.map((r) => db.sales.update(r.id, { syncStatus: 'synced', syncedAt: now })),
        ...pendingShifts.map((r) =>
          db.shifts.update(r.id, { syncStatus: 'synced', syncedAt: now })
        ),
        ...pendingTransfers.map((r) =>
          db.stockTransfers.update(r.id, { syncStatus: 'synced', syncedAt: now })
        ),
        ...pendingExpenses.map((r) =>
          db.expenses.update(r.id, { syncStatus: 'synced', syncedAt: now })
        ),
        ...pendingCustomers.map((r) =>
          db.customers.update(r.id, { syncStatus: 'synced', syncedAt: now })
        ),
        ...pendingProducts.map((r) =>
          db.products.update(r.id, { syncStatus: 'synced', syncedAt: now })
        ),
        ...pendingBranches.map((r) =>
          db.branches.update(r.id, { syncStatus: 'synced', syncedAt: now })
        ),
        ...pendingQuotes.map((r) =>
          db.supplierQuotes.update(r.id, { syncStatus: 'synced', syncedAt: now })
        ),
        ...pendingQueue.map((r) =>
          db.syncQueue.update(r.id, { syncStatus: 'synced', syncedAt: now })
        ),
        db.settings.put({ key: 'lastSyncedAt', value: now }),
      ]);
    }
  );

  const otherCount =
    pendingCustomers.length +
    pendingQuotes.length +
    pendingBranches.length +
    pendingQueue.filter((q) => q.operation === 'delete' || q.entityType === 'product').length;

  const syncedOperations = Math.max(
    pendingQueue.length,
    pendingSales.length +
      pendingShifts.length +
      pendingTransfers.length +
      pendingExpenses.length +
      otherCount
  );

  return {
    ok: true,
    syncedCount: syncedOperations,
    syncedAt: now,
    breakdown: {
      sales: pendingSales.length,
      shifts: pendingShifts.length,
      stockTransfers: pendingTransfers.length,
      expenses: pendingExpenses.length,
      other: otherCount,
    },
  };
}

export function formatSyncEntityLabel(entityType: SyncEntityType): string {
  switch (entityType) {
    case 'sale':
      return 'Venta';
    case 'shift':
      return 'Turno';
    case 'stockTransfer':
      return 'Stock / Traslado';
    case 'expense':
      return 'Gasto';
    case 'customer':
      return 'Cliente';
    case 'product':
      return 'Producto';
    case 'supplierQuote':
      return 'Proveedor';
    case 'branch':
      return 'Sucursal';
  }
}
