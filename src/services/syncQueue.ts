import { db, getLocalBusinessSettings, saveLocalBusinessSettings } from '../db/posDb';
import { supabase } from '../lib/supabase';
import type {
  Branch,
  BusinessSettings,
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
  pushedCount: number;
  pulledCount: number;
  syncedCount: number;
  syncedAt: string | null;
  reason?: 'offline' | 'unauthenticated' | 'empty' | 'error';
  errorMessage?: string;
  breakdown: {
    sales: number;
    shifts: number;
    stockTransfers: number;
    expenses: number;
    other: number;
  };
}

interface CloudBusinessSettingsRow {
  user_id: string;
  business_name: string;
  rif: string;
  phone: string;
  address: string;
  exchange_rate: number;
  updated_at: string;
}

interface CloudSyncRecordRow {
  user_id: string;
  entity_type: SyncEntityType;
  record_id: string;
  payload: Record<string, unknown>;
  deleted: boolean;
  updated_at: string;
}

const SYNC_BATCH_SIZE = 100;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecordTimestamp(record: { updatedAt?: string; createdAt?: string; openedAt?: string }): string {
  return record.updatedAt || record.createdAt || record.openedAt || '1970-01-01T00:00:00.000Z';
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
  businessSettings?: BusinessSettings | null;
}): PendingSyncSummary {
  const pendingSales = params.sales.filter((s) => s.syncStatus === 'pending').length;
  const pendingShifts = params.shifts.filter((s) => s.syncStatus === 'pending').length;
  const pendingTransfers = params.transfers.filter((t) => t.syncStatus === 'pending').length;
  const pendingExpenses = params.expenses.filter((e) => e.syncStatus === 'pending').length;
  const pendingCustomers = params.customers.filter((c) => c.syncStatus === 'pending').length;
  const pendingQuotes = params.supplierQuotes.filter((q) => q.syncStatus === 'pending').length;
  const pendingQueueItems = params.syncQueue.filter((q) => q.syncStatus === 'pending').length;
  const pendingSettings = params.businessSettings?.syncStatus === 'pending' ? 1 : 0;

  const pendingDeleteOps = params.syncQueue.filter(
    (q) => q.syncStatus === 'pending' && q.operation === 'delete'
  ).length;
  const pendingProductPriceOps = params.syncQueue.filter(
    (q) => q.syncStatus === 'pending' && q.entityType === 'product'
  ).length;

  const pendingOther =
    pendingCustomers + pendingQuotes + pendingDeleteOps + pendingProductPriceOps + pendingSettings;
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

async function upsertSyncRecordsInBatches(rows: CloudSyncRecordRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += SYNC_BATCH_SIZE) {
    const batch = rows.slice(i, i + SYNC_BATCH_SIZE);
    const { error } = await supabase
      .from('sync_records')
      .upsert(batch, { onConflict: 'user_id,entity_type,record_id' });
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function buildInitialSeedRows(userId: string, now: string): Promise<CloudSyncRecordRow[]> {
  const [branches, products, customers, sales, shifts, transfers, quotes, expenses] =
    await Promise.all([
      db.branches.toArray(),
      db.products.toArray(),
      db.customers.toArray(),
      db.sales.toArray(),
      db.shifts.toArray(),
      db.stockTransfers.toArray(),
      db.supplierQuotes.toArray(),
      db.expenses.toArray(),
    ]);

  const rows: CloudSyncRecordRow[] = [];

  const pushCollection = <T extends { id: string; updatedAt?: string; createdAt?: string; openedAt?: string }>(
    entityType: SyncEntityType,
    items: T[]
  ) => {
    items.forEach((item) => {
      rows.push({
        user_id: userId,
        entity_type: entityType,
        record_id: item.id,
        payload: { ...item, syncStatus: 'synced', syncedAt: now } as unknown as Record<string, unknown>,
        deleted: false,
        updated_at: item.updatedAt || item.createdAt || item.openedAt || now,
      });
    });
  };

  pushCollection('branch', branches);
  pushCollection('product', products);
  pushCollection('customer', customers);
  pushCollection('sale', sales);
  pushCollection('shift', shifts);
  pushCollection('stockTransfer', transfers);
  pushCollection('supplierQuote', quotes);
  pushCollection('expense', expenses);

  return rows;
}

async function mergePulledRecordsIntoIndexedDB(
  cloudRows: CloudSyncRecordRow[],
  syncedAt: string
): Promise<number> {
  if (cloudRows.length === 0) return 0;

  let mergedCount = 0;

  await db.transaction(
    'rw',
    [
      db.branches,
      db.products,
      db.customers,
      db.sales,
      db.shifts,
      db.stockTransfers,
      db.supplierQuotes,
      db.expenses,
    ],
    async () => {
      for (const row of cloudRows) {
        if (!row.record_id || !row.entity_type) continue;

        const cloudUpdatedAt = row.updated_at || syncedAt;

        if (row.deleted) {
          switch (row.entity_type) {
            case 'branch':
              await db.branches.delete(row.record_id);
              mergedCount += 1;
              break;
            case 'product':
              await db.products.delete(row.record_id);
              mergedCount += 1;
              break;
            case 'customer':
              await db.customers.delete(row.record_id);
              mergedCount += 1;
              break;
            case 'sale':
              await db.sales.delete(row.record_id);
              mergedCount += 1;
              break;
            case 'shift':
              await db.shifts.delete(row.record_id);
              mergedCount += 1;
              break;
            case 'stockTransfer':
              await db.stockTransfers.delete(row.record_id);
              mergedCount += 1;
              break;
            case 'supplierQuote':
              await db.supplierQuotes.delete(row.record_id);
              mergedCount += 1;
              break;
            case 'expense':
              await db.expenses.delete(row.record_id);
              mergedCount += 1;
              break;
            default:
              break;
          }
          continue;
        }

        if (!isRecordObject(row.payload)) continue;

        const incoming = {
          ...row.payload,
          id: row.record_id,
          updatedAt: cloudUpdatedAt,
          syncStatus: 'synced' as const,
          syncedAt,
        };

        const shouldApply = (
          local: { syncStatus?: string; updatedAt?: string; createdAt?: string; openedAt?: string } | undefined
        ): boolean => {
          if (!local) return true;
          if (local.syncStatus === 'pending') {
            return cloudUpdatedAt > getRecordTimestamp(local);
          }
          return cloudUpdatedAt >= getRecordTimestamp(local);
        };

        switch (row.entity_type) {
          case 'branch': {
            const local = await db.branches.get(row.record_id);
            if (shouldApply(local)) {
              await db.branches.put(incoming as unknown as Branch);
              mergedCount += 1;
            }
            break;
          }
          case 'product': {
            const local = await db.products.get(row.record_id);
            if (shouldApply(local)) {
              await db.products.put(incoming as unknown as Product);
              mergedCount += 1;
            }
            break;
          }
          case 'customer': {
            const local = await db.customers.get(row.record_id);
            if (shouldApply(local)) {
              await db.customers.put(incoming as unknown as Customer);
              mergedCount += 1;
            }
            break;
          }
          case 'sale': {
            const local = await db.sales.get(row.record_id);
            if (shouldApply(local)) {
              await db.sales.put(incoming as unknown as Sale);
              mergedCount += 1;
            }
            break;
          }
          case 'shift': {
            const local = await db.shifts.get(row.record_id);
            if (shouldApply(local)) {
              await db.shifts.put(incoming as unknown as Shift);
              mergedCount += 1;
            }
            break;
          }
          case 'stockTransfer': {
            const local = await db.stockTransfers.get(row.record_id);
            if (shouldApply(local)) {
              await db.stockTransfers.put(incoming as unknown as StockTransfer);
              mergedCount += 1;
            }
            break;
          }
          case 'supplierQuote': {
            const local = await db.supplierQuotes.get(row.record_id);
            if (shouldApply(local)) {
              await db.supplierQuotes.put(incoming as unknown as SupplierQuote);
              mergedCount += 1;
            }
            break;
          }
          case 'expense': {
            const local = await db.expenses.get(row.record_id);
            if (shouldApply(local)) {
              await db.expenses.put(incoming as unknown as Expense);
              mergedCount += 1;
            }
            break;
          }
          default:
            break;
        }
      }
    }
  );

  return mergedCount;
}

export async function processSyncQueue(options?: {
  userId?: string | null;
  pullFromCloud?: boolean;
}): Promise<SyncProcessResult> {
  const emptyBreakdown = { sales: 0, shifts: 0, stockTransfers: 0, expenses: 0, other: 0 };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      pushedCount: 0,
      pulledCount: 0,
      syncedCount: 0,
      syncedAt: null,
      reason: 'offline',
      breakdown: emptyBreakdown,
    };
  }

  const userId = options?.userId ?? null;
  if (!userId) {
    return {
      ok: false,
      pushedCount: 0,
      pulledCount: 0,
      syncedCount: 0,
      syncedAt: null,
      reason: 'unauthenticated',
      breakdown: emptyBreakdown,
    };
  }

  const now = new Date().toISOString();

  try {
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
      localSettings,
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
      getLocalBusinessSettings(),
    ]);

    const rowsToPush: CloudSyncRecordRow[] = [];

    const appendPending = <T extends { id: string; updatedAt?: string; createdAt?: string; openedAt?: string }>(
      entityType: SyncEntityType,
      items: T[]
    ) => {
      items.forEach((item) => {
        rowsToPush.push({
          user_id: userId,
          entity_type: entityType,
          record_id: item.id,
          payload: { ...item, syncStatus: 'synced', syncedAt: now } as unknown as Record<string, unknown>,
          deleted: false,
          updated_at: item.updatedAt || item.createdAt || item.openedAt || now,
        });
      });
    };

    appendPending('branch', pendingBranches);
    appendPending('product', pendingProducts);
    appendPending('customer', pendingCustomers);
    appendPending('sale', pendingSales);
    appendPending('shift', pendingShifts);
    appendPending('stockTransfer', pendingTransfers);
    appendPending('supplierQuote', pendingQuotes);
    appendPending('expense', pendingExpenses);

    // Push explicit delete tombstones tracked in syncQueue
    pendingQueue
      .filter((item) => item.operation === 'delete' && item.entityType !== 'businessSettings')
      .forEach((item) => {
        rowsToPush.push({
          user_id: userId,
          entity_type: item.entityType,
          record_id: item.entityId,
          payload: { id: item.entityId, deleted: true },
          deleted: true,
          updated_at: item.timestamp || now,
        });
      });

    // 1. Push pending sync_records to Supabase
    if (rowsToPush.length > 0) {
      await upsertSyncRecordsInBatches(rowsToPush);
    }

    // 2. Sync business_settings (push pending local changes or pull newer cloud settings)
    const { data: cloudSettingsData, error: cloudSettingsError } = await supabase
      .from('business_settings')
      .select('user_id, business_name, rif, phone, address, exchange_rate, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (cloudSettingsError) {
      throw new Error(cloudSettingsError.message);
    }

    const cloudSettings = cloudSettingsData as CloudBusinessSettingsRow | null;
    let settingsPushed = false;
    let settingsPulled = false;

    if (
      !cloudSettings ||
      localSettings.syncStatus === 'pending' ||
      localSettings.updatedAt > cloudSettings.updated_at
    ) {
      const { error: upsertSettingsError } = await supabase.from('business_settings').upsert(
        {
          user_id: userId,
          business_name: localSettings.businessName,
          rif: localSettings.rif,
          phone: localSettings.phone,
          address: localSettings.address,
          exchange_rate: localSettings.exchangeRate,
          updated_at: localSettings.syncStatus === 'pending' ? localSettings.updatedAt : now,
        },
        { onConflict: 'user_id' }
      );
      if (upsertSettingsError) {
        throw new Error(upsertSettingsError.message);
      }
      await saveLocalBusinessSettings({
        ...localSettings,
        syncStatus: 'synced',
        syncedAt: now,
      });
      settingsPushed = localSettings.syncStatus === 'pending';
    } else if (cloudSettings.updated_at > localSettings.updatedAt) {
      const parsedCloudRate = Number(cloudSettings.exchange_rate);
      const validRate =
        Number.isFinite(parsedCloudRate) && parsedCloudRate > 0
          ? parsedCloudRate
          : localSettings.exchangeRate;

      await saveLocalBusinessSettings({
        businessName: cloudSettings.business_name || localSettings.businessName,
        rif: cloudSettings.rif ?? '',
        phone: cloudSettings.phone ?? '',
        address: cloudSettings.address ?? '',
        exchangeRate: validRate,
        updatedAt: cloudSettings.updated_at,
        syncStatus: 'synced',
        syncedAt: now,
      });
      settingsPulled = true;
    }

    // 3. Mark pushed local records and queue items as synced in IndexedDB
    const hasPendingLocalWrites =
      rowsToPush.length > 0 || pendingQueue.length > 0 || settingsPushed;

    if (hasPendingLocalWrites) {
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
            ...pendingShifts.map((r) => db.shifts.update(r.id, { syncStatus: 'synced', syncedAt: now })),
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
    }

    // 4. Pull remote records from Supabase and merge into IndexedDB
    let pulledCount = settingsPulled ? 1 : 0;
    let initialSeedPushed = 0;

    if (options?.pullFromCloud !== false) {
      const { data: cloudRecordsData, error: pullError } = await supabase
        .from('sync_records')
        .select('user_id, entity_type, record_id, payload, deleted, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: true });

      if (pullError) {
        throw new Error(pullError.message);
      }

      const cloudRows = (cloudRecordsData ?? []) as CloudSyncRecordRow[];

      if (cloudRows.length === 0) {
        // First sync for a brand-new account: seed cloud with local catalog/branches/customers
        const seedRows = await buildInitialSeedRows(userId, now);
        if (seedRows.length > 0) {
          await upsertSyncRecordsInBatches(seedRows);
          initialSeedPushed = seedRows.length;
        }
      } else {
        pulledCount += await mergePulledRecordsIntoIndexedDB(cloudRows, now);
      }
    }

    await db.settings.put({ key: 'lastSyncedAt', value: now });

    const otherCount =
      pendingCustomers.length +
      pendingQuotes.length +
      pendingBranches.length +
      (settingsPushed ? 1 : 0) +
      pendingQueue.filter((q) => q.operation === 'delete' || q.entityType === 'product').length;

    const pushedCount =
      Math.max(
        pendingQueue.length,
        pendingSales.length +
          pendingShifts.length +
          pendingTransfers.length +
          pendingExpenses.length +
          otherCount
      ) + initialSeedPushed;

    const totalSynced = pushedCount + pulledCount;

    return {
      ok: true,
      pushedCount,
      pulledCount,
      syncedCount: totalSynced,
      syncedAt: now,
      reason: totalSynced === 0 ? 'empty' : undefined,
      breakdown: {
        sales: pendingSales.length,
        shifts: pendingShifts.length,
        stockTransfers: pendingTransfers.length,
        expenses: pendingExpenses.length,
        other: otherCount,
      },
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Error de red al sincronizar con Supabase.';
    return {
      ok: false,
      pushedCount: 0,
      pulledCount: 0,
      syncedCount: 0,
      syncedAt: null,
      reason: 'error',
      errorMessage,
      breakdown: emptyBreakdown,
    };
  }
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
    case 'businessSettings':
      return 'Configuración';
  }
}
