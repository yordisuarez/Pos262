import { db, getLocalBusinessSettings, saveLocalBusinessSettings } from '../db/posDb';
import { supabase } from '../lib/supabase';
import type {
  Branch,
  BusinessSettings,
  Cashier,
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
let activeSyncPromise: Promise<SyncProcessResult> | null = null;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecordTimestamp(record: {
  updatedAt?: string;
  createdAt?: string;
  openedAt?: string;
}): string {
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
  cashiers?: Cashier[];
  syncQueue: SyncQueueItem[];
  businessSettings?: BusinessSettings | null;
}): PendingSyncSummary {
  const pendingSales = params.sales.filter((s) => s.syncStatus === 'pending').length;
  const pendingShifts = params.shifts.filter((s) => s.syncStatus === 'pending').length;
  const pendingTransfers = params.transfers.filter((t) => t.syncStatus === 'pending').length;
  const pendingExpenses = params.expenses.filter((e) => e.syncStatus === 'pending').length;
  const pendingCustomers = params.customers.filter((c) => c.syncStatus === 'pending').length;
  const pendingQuotes = params.supplierQuotes.filter((q) => q.syncStatus === 'pending').length;
  const pendingCashiers = (params.cashiers ?? []).filter((c) => c.syncStatus === 'pending').length;
  const pendingQueueItems = params.syncQueue.filter((q) => q.syncStatus === 'pending').length;
  const pendingSettings = params.businessSettings?.syncStatus === 'pending' ? 1 : 0;

  const pendingDeleteOps = params.syncQueue.filter(
    (q) => q.syncStatus === 'pending' && q.operation === 'delete'
  ).length;
  const pendingProductPriceOps = params.syncQueue.filter(
    (q) => q.syncStatus === 'pending' && q.entityType === 'product'
  ).length;

  const pendingOther =
    pendingCustomers +
    pendingQuotes +
    pendingCashiers +
    pendingDeleteOps +
    pendingProductPriceOps +
    pendingSettings;
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

/**
 * Deduplicates rows by composite primary key `(user_id, entity_type, record_id)`
 * keeping the most recent state (`updated_at`, or later entry on tie).
 * Prevents PostgreSQL `ON CONFLICT DO UPDATE command cannot affect row a second time`.
 */
function deduplicateSyncRows(rows: CloudSyncRecordRow[]): CloudSyncRecordRow[] {
  const map = new Map<string, CloudSyncRecordRow>();
  for (const row of rows) {
    if (!row.user_id || !row.entity_type || !row.record_id) continue;
    const key = `${row.user_id}::${row.entity_type}::${row.record_id}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const existingTs = existing.updated_at || '';
    const nextTs = row.updated_at || '';
    if (nextTs >= existingTs) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

async function upsertSyncRecordsInBatches(rows: CloudSyncRecordRow[]): Promise<number> {
  const uniqueRows = deduplicateSyncRows(rows);
  for (let i = 0; i < uniqueRows.length; i += SYNC_BATCH_SIZE) {
    const batch = uniqueRows.slice(i, i + SYNC_BATCH_SIZE);
    const { error } = await supabase
      .from('sync_records')
      .upsert(batch, { onConflict: 'user_id,entity_type,record_id' });
    if (error) {
      throw new Error(error.message);
    }
  }
  return uniqueRows.length;
}

async function buildAllLocalSyncRows(userId: string, now: string): Promise<CloudSyncRecordRow[]> {
  const [branches, cashiers, products, customers, sales, shifts, transfers, quotes, expenses] =
    await Promise.all([
      db.branches.toArray(),
      db.cashiers.toArray(),
      db.products.toArray(),
      db.customers.toArray(),
      db.sales.toArray(),
      db.shifts.toArray(),
      db.stockTransfers.toArray(),
      db.supplierQuotes.toArray(),
      db.expenses.toArray(),
    ]);

  const rows: CloudSyncRecordRow[] = [];

  const pushCollection = <
    T extends { id: string; updatedAt?: string; createdAt?: string; openedAt?: string },
  >(
    entityType: SyncEntityType,
    items: T[]
  ) => {
    items.forEach((item) => {
      rows.push({
        user_id: userId,
        entity_type: entityType,
        record_id: item.id,
        payload: { ...item, syncStatus: 'synced', syncedAt: now } as unknown as Record<
          string,
          unknown
        >,
        deleted: false,
        updated_at: item.updatedAt || item.createdAt || item.openedAt || now,
      });
    });
  };

  pushCollection('branch', branches);
  pushCollection(
    'cashier',
    cashiers.filter((c) => !c.userId || c.userId === userId).map((c) => ({ ...c, userId }))
  );
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
  syncedAt: string,
  userId: string
): Promise<number> {
  if (cloudRows.length === 0) return 0;

  let mergedCount = 0;

  await db.transaction(
    'rw',
    [
      db.branches,
      db.cashiers,
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
              if (await db.branches.get(row.record_id)) {
                await db.branches.delete(row.record_id);
                mergedCount += 1;
              }
              break;
            case 'cashier':
              if (await db.cashiers.get(row.record_id)) {
                await db.cashiers.delete(row.record_id);
                mergedCount += 1;
              }
              break;
            case 'product':
              if (await db.products.get(row.record_id)) {
                await db.products.delete(row.record_id);
                mergedCount += 1;
              }
              break;
            case 'customer':
              if (await db.customers.get(row.record_id)) {
                await db.customers.delete(row.record_id);
                mergedCount += 1;
              }
              break;
            case 'sale':
              if (await db.sales.get(row.record_id)) {
                await db.sales.delete(row.record_id);
                mergedCount += 1;
              }
              break;
            case 'shift':
              if (await db.shifts.get(row.record_id)) {
                await db.shifts.delete(row.record_id);
                mergedCount += 1;
              }
              break;
            case 'stockTransfer':
              if (await db.stockTransfers.get(row.record_id)) {
                await db.stockTransfers.delete(row.record_id);
                mergedCount += 1;
              }
              break;
            case 'supplierQuote':
              if (await db.supplierQuotes.get(row.record_id)) {
                await db.supplierQuotes.delete(row.record_id);
                mergedCount += 1;
              }
              break;
            case 'expense':
              if (await db.expenses.get(row.record_id)) {
                await db.expenses.delete(row.record_id);
                mergedCount += 1;
              }
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
          local:
            | { syncStatus?: string; updatedAt?: string; createdAt?: string; openedAt?: string }
            | undefined
        ): boolean => {
          if (!local) return true;
          const localTs = getRecordTimestamp(local);
          if (local.syncStatus === 'pending') {
            return cloudUpdatedAt > localTs;
          }
          return cloudUpdatedAt > localTs;
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
          case 'cashier': {
            const local = await db.cashiers.get(row.record_id);
            if (shouldApply(local)) {
              const incomingRole =
                row.payload.role === 'admin' ? ('admin' as const) : ('cashier' as const);
              await db.cashiers.put({
                ...(incoming as unknown as Cashier),
                userId,
                role: incomingRole,
              });
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

async function executeSyncQueue(options?: {
  userId?: string | null;
  pullFromCloud?: boolean;
  reconcileMissingLocal?: boolean;
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
      pendingCashiers,
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
      db.cashiers.where('syncStatus').equals('pending').toArray(),
      db.supplierQuotes.where('syncStatus').equals('pending').toArray(),
      db.syncQueue.where('syncStatus').equals('pending').toArray(),
      getLocalBusinessSettings(),
    ]);

    const rowsToPush: CloudSyncRecordRow[] = [];

    const appendPending = <
      T extends { id: string; updatedAt?: string; createdAt?: string; openedAt?: string },
    >(
      entityType: SyncEntityType,
      items: T[]
    ) => {
      items.forEach((item) => {
        rowsToPush.push({
          user_id: userId,
          entity_type: entityType,
          record_id: item.id,
          payload: { ...item, syncStatus: 'synced', syncedAt: now } as unknown as Record<
            string,
            unknown
          >,
          deleted: false,
          updated_at: item.updatedAt || item.createdAt || item.openedAt || now,
        });
      });
    };

    appendPending('branch', pendingBranches);
    appendPending(
      'cashier',
      pendingCashiers.filter((c) => !c.userId || c.userId === userId).map((c) => ({ ...c, userId }))
    );
    appendPending('product', pendingProducts);
    appendPending('customer', pendingCustomers);
    appendPending('sale', pendingSales);
    appendPending('shift', pendingShifts);
    appendPending('stockTransfer', pendingTransfers);
    appendPending('supplierQuote', pendingQuotes);
    appendPending('expense', pendingExpenses);

    // Push explicit delete tombstones tracked in syncQueue (sorted oldest->newest so latest wins)
    [...pendingQueue]
      .filter((item) => item.operation === 'delete' && item.entityType !== 'businessSettings')
      .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
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

    const deduplicatedRowsToPush = deduplicateSyncRows(rowsToPush);

    // 1. Push deduplicated pending sync_records to Supabase via upsert
    let confirmedRowsPushed = 0;
    if (deduplicatedRowsToPush.length > 0) {
      confirmedRowsPushed = await upsertSyncRecordsInBatches(deduplicatedRowsToPush);
    }

    // 2. Sync business_settings (upsert local changes or pull newer cloud settings)
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
      settingsPushed = localSettings.syncStatus === 'pending' || !cloudSettings;
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
          db.cashiers,
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
            ...pendingCashiers.map((r) =>
              db.cashiers.update(r.id, { userId, syncStatus: 'synced', syncedAt: now })
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
    let reconciledPushed = 0;

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
        // First sync for a brand-new cloud account: upload full deduplicated local dataset
        const seedRows = deduplicateSyncRows(await buildAllLocalSyncRows(userId, now));
        if (seedRows.length > 0) {
          reconciledPushed = await upsertSyncRecordsInBatches(seedRows);
        }
      } else {
        pulledCount += await mergePulledRecordsIntoIndexedDB(cloudRows, now, userId);

        // On manual sync or reconciliation, also upload any pre-existing local records absent from cloud
        if (options?.reconcileMissingLocal) {
          const cloudKeySet = new Set(cloudRows.map((r) => `${r.entity_type}:${r.record_id}`));
          const allLocalRows = deduplicateSyncRows(await buildAllLocalSyncRows(userId, now));
          const missingOnCloud = allLocalRows.filter(
            (row) => !cloudKeySet.has(`${row.entity_type}:${row.record_id}`)
          );
          if (missingOnCloud.length > 0) {
            reconciledPushed = await upsertSyncRecordsInBatches(missingOnCloud);
          }
        }
      }
    }

    await db.settings.put({ key: 'lastSyncedAt', value: now });

    const otherCount =
      pendingCustomers.length +
      pendingQuotes.length +
      pendingBranches.length +
      pendingCashiers.length +
      (settingsPushed ? 1 : 0) +
      pendingQueue.filter((q) => q.operation === 'delete' || q.entityType === 'product').length;

    const pushedCount =
      Math.max(confirmedRowsPushed + (settingsPushed ? 1 : 0), pendingQueue.length) +
      reconciledPushed;

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

export async function processSyncQueue(options?: {
  userId?: string | null;
  pullFromCloud?: boolean;
  reconcileMissingLocal?: boolean;
}): Promise<SyncProcessResult> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = executeSyncQueue(options).finally(() => {
    activeSyncPromise = null;
  });

  return activeSyncPromise;
}

/**
 * Optional Supabase Realtime subscription so changes from another device
 * automatically trigger a local IndexedDB refresh when online.
 */
export function subscribeToCloudChanges(userId: string, onRemoteChange: () => void): () => void {
  try {
    const channel = supabase
      .channel(`pos_262_sync_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_records',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          onRemoteChange();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'business_settings',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          onRemoteChange();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}

/**
 * Clears operational test data (sales, shifts, expenses, stock transfers, sync queue, and customer receivable balances)
 * locally in IndexedDB/localStorage and in Supabase `sync_records` strictly for the authenticated `user_id`,
 * while preserving the user account, `public.subscriptions`, internal users, branches, products, and business settings.
 */
export async function resetOperationalData(userId: string | null): Promise<{
  ok: boolean;
  cloudCleared: boolean;
  errorMessage?: string;
}> {
  const now = new Date().toISOString();
  const operationalEntityTypes: SyncEntityType[] = ['sale', 'shift', 'expense', 'stockTransfer'];

  let cloudCleared = false;
  let errorMessage: string | undefined;

  if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { error: deleteError } = await supabase
        .from('sync_records')
        .delete()
        .eq('user_id', userId)
        .in('entity_type', operationalEntityTypes);

      if (deleteError) {
        errorMessage = deleteError.message;
      } else {
        cloudCleared = true;
      }
    } catch (err) {
      errorMessage =
        err instanceof Error
          ? err.message
          : 'No se pudo limpiar la nube ahora. Los datos locales sí fueron reiniciados.';
    }
  }

  const allCustomers = await db.customers.toArray();
  const resetCustomers = allCustomers
    .filter((c) => c.balanceUsd !== 0)
    .map((c) => ({
      ...c,
      balanceUsd: 0,
      updatedAt: now,
      syncStatus: 'pending' as const,
    }));

  await db.transaction(
    'rw',
    [db.sales, db.shifts, db.expenses, db.stockTransfers, db.syncQueue, db.customers, db.settings],
    async () => {
      await Promise.all([
        db.sales.clear(),
        db.shifts.clear(),
        db.expenses.clear(),
        db.stockTransfers.clear(),
        db.syncQueue.clear(),
        ...resetCustomers.map((c) => db.customers.put(c)),
        db.settings.put({ key: 'operationalResetCompleted', value: now }),
        db.settings.delete('lastSyncedAt'),
      ]);
    }
  );

  // Sync reset customer receivable balances (0.00) back to Supabase if online
  if (userId && cloudCleared && resetCustomers.length > 0) {
    try {
      const customerRows: CloudSyncRecordRow[] = resetCustomers.map((c) => ({
        user_id: userId,
        entity_type: 'customer',
        record_id: c.id,
        payload: { ...c, syncStatus: 'synced', syncedAt: now } as unknown as Record<string, unknown>,
        deleted: false,
        updated_at: now,
      }));
      await upsertSyncRecordsInBatches(customerRows);
      await db.transaction('rw', db.customers, async () => {
        await Promise.all(
          resetCustomers.map((c) => db.customers.update(c.id, { syncStatus: 'synced', syncedAt: now }))
        );
      });
    } catch {
      // Customer zero-balances remain pending for next sync
    }
  }

  return {
    ok: !errorMessage,
    cloudCleared,
    errorMessage,
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
    case 'cashier':
      return 'Usuario interno';
    case 'businessSettings':
      return 'Configuración';
  }
}
