import Dexie, { type EntityTable } from 'dexie';
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
  SyncQueueItem,
} from '../types/pos';

export interface SettingEntry {
  key: string;
  value: string;
}

class Pos262Database extends Dexie {
  branches!: EntityTable<Branch, 'id'>;
  cashiers!: EntityTable<Cashier, 'id'>;
  products!: EntityTable<Product, 'id'>;
  customers!: EntityTable<Customer, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  shifts!: EntityTable<Shift, 'id'>;
  stockTransfers!: EntityTable<StockTransfer, 'id'>;
  supplierQuotes!: EntityTable<SupplierQuote, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  settings!: EntityTable<SettingEntry, 'key'>;

  constructor() {
    super('pos_262_db');

    this.version(1).stores({
      branches: 'id, code, name',
      products: 'id, sku, barcode, name, category',
      customers: 'id, name, documentId, phone',
      sales: 'id, receiptNumber, branchId, customerId, createdAt, syncStatus',
      shifts: 'id, branchId, cashierId, status, openedAt',
      settings: 'key',
    });

    this.version(2).stores({
      branches: 'id, code, name, syncStatus',
      cashiers: 'id, name, role, branchId',
      products: 'id, sku, barcode, name, category, syncStatus',
      customers: 'id, name, documentId, phone, syncStatus',
      sales: 'id, receiptNumber, branchId, shiftId, customerId, createdAt, syncStatus',
      shifts: 'id, branchId, cashierId, status, openedAt, syncStatus',
      stockTransfers: 'id, type, productId, fromBranchId, toBranchId, createdAt, syncStatus',
      settings: 'key',
    });

    this.version(3).stores({
      branches: 'id, code, name, syncStatus',
      cashiers: 'id, name, role, branchId',
      products: 'id, sku, barcode, name, category, syncStatus',
      customers: 'id, name, documentId, phone, syncStatus',
      sales: 'id, receiptNumber, branchId, shiftId, customerId, createdAt, syncStatus',
      shifts: 'id, branchId, cashierId, status, openedAt, syncStatus',
      stockTransfers: 'id, type, productId, fromBranchId, toBranchId, createdAt, syncStatus',
      supplierQuotes: 'id, productId, supplierName, unitCostUsd, updatedAt, syncStatus',
      expenses: 'id, branchId, type, expenseDate, createdAt, syncStatus',
      settings: 'key',
    });

    this.version(4).stores({
      branches: 'id, code, name, syncStatus',
      cashiers: 'id, name, role, branchId',
      products: 'id, sku, barcode, name, category, syncStatus',
      customers: 'id, name, documentId, phone, syncStatus',
      sales: 'id, receiptNumber, branchId, shiftId, customerId, createdAt, syncStatus',
      shifts: 'id, branchId, cashierId, status, openedAt, syncStatus',
      stockTransfers: 'id, type, productId, fromBranchId, toBranchId, createdAt, syncStatus',
      supplierQuotes: 'id, productId, supplierName, unitCostUsd, updatedAt, syncStatus',
      expenses: 'id, branchId, type, expenseDate, createdAt, syncStatus',
      syncQueue: 'id, entityType, entityId, syncStatus, timestamp',
      settings: 'key',
    });

    this.version(5).stores({
      branches: 'id, code, name, syncStatus',
      cashiers: 'id, userId, name, role, branchId, syncStatus',
      products: 'id, sku, barcode, name, category, syncStatus',
      customers: 'id, name, documentId, phone, syncStatus',
      sales: 'id, receiptNumber, branchId, shiftId, customerId, createdAt, syncStatus',
      shifts: 'id, branchId, cashierId, status, openedAt, syncStatus',
      stockTransfers: 'id, type, productId, fromBranchId, toBranchId, createdAt, syncStatus',
      supplierQuotes: 'id, productId, supplierName, unitCostUsd, updatedAt, syncStatus',
      expenses: 'id, branchId, type, expenseDate, createdAt, syncStatus',
      syncQueue: 'id, entityType, entityId, syncStatus, timestamp',
      settings: 'key',
    });
  }
}

export const db = new Pos262Database();

const ACTIVE_OWNER_KEY = 'activeCloudOwnerUserId';
const LEGACY_DEMO_CASHIER_IDS = new Set(['cashier-admin', 'cashier-01', 'cashier-02']);

const ACCOUNT_SCOPED_SETTING_KEYS = [
  'activeCashierId',
  'activeBranchId',
  'lastSyncedAt',
  'businessName',
  'businessRif',
  'businessPhone',
  'businessAddress',
  'exchangeRate',
  'businessSettingsUpdatedAt',
  'businessSettingsSyncStatus',
  'businessSettingsSyncedAt',
  'operationalResetCompleted',
  'fullDataWipeAt',
  'pendingFullCloudWipe',
];

export const CLEAN_PRIMARY_BRANCH: Branch = {
  id: 'branch-principal',
  name: 'Sucursal Principal',
  code: 'SUC-01',
  address: '',
  phone: '',
  isActive: true,
  syncStatus: 'synced',
};

export function getFullWipeStorageKey(ownerUserId: string | null): string {
  return `pos_262_full_wipe_${ownerUserId ?? 'local'}`;
}

export function readFullWipeLocalMarker(ownerUserId: string | null): string | null {
  try {
    return localStorage.getItem(getFullWipeStorageKey(ownerUserId));
  } catch {
    return null;
  }
}

export function writeFullWipeLocalMarker(ownerUserId: string | null, isoTimestamp: string): void {
  try {
    localStorage.setItem(getFullWipeStorageKey(ownerUserId), isoTimestamp);
  } catch {
    // Ignore storage quota errors
  }
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  businessName: '',
  rif: '',
  phone: '',
  address: '',
  exchangeRate: 1,
  updatedAt: new Date(0).toISOString(),
  syncStatus: 'synced',
};

export async function getLocalBusinessSettings(): Promise<BusinessSettings> {
  const entries = await db.settings.bulkGet([
    'businessName',
    'businessRif',
    'businessPhone',
    'businessAddress',
    'exchangeRate',
    'businessSettingsUpdatedAt',
    'businessSettingsSyncStatus',
    'businessSettingsSyncedAt',
  ]);

  const map = new Map<string, string>();
  entries.forEach((entry) => {
    if (entry) map.set(entry.key, entry.value);
  });

  const parsedRate = parseFloat((map.get('exchangeRate') || '').replace(',', '.'));
  const exchangeRate =
    Number.isFinite(parsedRate) && parsedRate > 0
      ? parsedRate
      : DEFAULT_BUSINESS_SETTINGS.exchangeRate;

  const rawSyncStatus = map.get('businessSettingsSyncStatus');
  const syncStatus = rawSyncStatus === 'pending' ? 'pending' : 'synced';

  return {
    businessName: map.get('businessName') || DEFAULT_BUSINESS_SETTINGS.businessName,
    rif: map.get('businessRif') ?? DEFAULT_BUSINESS_SETTINGS.rif,
    phone: map.get('businessPhone') ?? DEFAULT_BUSINESS_SETTINGS.phone,
    address: map.get('businessAddress') ?? DEFAULT_BUSINESS_SETTINGS.address,
    exchangeRate,
    updatedAt: map.get('businessSettingsUpdatedAt') || DEFAULT_BUSINESS_SETTINGS.updatedAt,
    syncStatus,
    syncedAt: map.get('businessSettingsSyncedAt') || undefined,
  };
}

export async function saveLocalBusinessSettings(settings: BusinessSettings): Promise<void> {
  const entries: SettingEntry[] = [
    { key: 'businessName', value: settings.businessName },
    { key: 'businessRif', value: settings.rif },
    { key: 'businessPhone', value: settings.phone },
    { key: 'businessAddress', value: settings.address },
    { key: 'exchangeRate', value: settings.exchangeRate.toFixed(2) },
    { key: 'businessSettingsUpdatedAt', value: settings.updatedAt },
    { key: 'businessSettingsSyncStatus', value: settings.syncStatus },
  ];

  if (settings.syncedAt) {
    entries.push({ key: 'businessSettingsSyncedAt', value: settings.syncedAt });
  }

  await db.settings.bulkPut(entries);
}

/**
 * Removes any legacy hardcoded demo cashiers and ensures all internal users
 * belong strictly to the active owner scope.
 */
export async function purgeResidualCashiers(ownerUserId: string | null): Promise<void> {
  const allCashiers = await db.cashiers.toArray();
  const invalidIds = allCashiers
    .filter((cashier) => {
      if (LEGACY_DEMO_CASHIER_IDS.has(cashier.id)) return true;
      if (ownerUserId) {
        return cashier.userId !== ownerUserId;
      }
      return Boolean(cashier.userId && cashier.userId !== 'local');
    })
    .map((cashier) => cashier.id);

  if (invalidIds.length > 0) {
    await db.cashiers.bulkDelete(invalidIds);
  }

  const activeCashierSetting = await db.settings.get('activeCashierId');
  if (activeCashierSetting?.value && invalidIds.includes(activeCashierSetting.value)) {
    await db.settings.delete('activeCashierId');
  }
}

/**
 * Removes legacy "Consumidor Final (V-00000000)" placeholder records so the
 * cart always uses the clean generic "Cliente" option without fictitious IDs.
 */
export async function purgeLegacyGenericCustomers(): Promise<void> {
  const allCustomers = await db.customers.toArray();
  const legacyIds = allCustomers
    .filter(
      (c) =>
        c.id === 'cust-final' ||
        c.name.trim().toLowerCase() === 'consumidor final'
    )
    .map((c) => c.id);

  if (legacyIds.length > 0) {
    await db.customers.bulkDelete(legacyIds);
  }
}

/**
 * Isolates IndexedDB storage by authenticated Supabase `user_id`.
 * Whenever a different account signs in (or legacy un-owned local data exists),
 * clears all residual data so the new account begins completely isolated with 0 internal users.
 */
export async function isolateLocalDatabaseForUser(userId: string | null): Promise<boolean> {
  const targetOwner = userId ?? 'local';
  const currentOwnerEntry = await db.settings.get(ACTIVE_OWNER_KEY);
  const currentOwner = currentOwnerEntry?.value ?? null;

  if (currentOwner !== targetOwner) {
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
        db.syncQueue,
        db.settings,
      ],
      async () => {
        await Promise.all([
          db.branches.clear(),
          db.cashiers.clear(),
          db.products.clear(),
          db.customers.clear(),
          db.sales.clear(),
          db.shifts.clear(),
          db.stockTransfers.clear(),
          db.supplierQuotes.clear(),
          db.expenses.clear(),
          db.syncQueue.clear(),
          db.settings.bulkDelete(ACCOUNT_SCOPED_SETTING_KEYS),
        ]);
        await db.settings.put({ key: ACTIVE_OWNER_KEY, value: targetOwner });
      }
    );

    try {
      localStorage.removeItem('pos_262_exchange_rate');
    } catch {
      // Ignore storage errors
    }

    await seedDatabaseIfNeeded(userId);
    return true;
  }

  await purgeResidualCashiers(userId);
  await purgeLegacyGenericCustomers();
  await seedDatabaseIfNeeded(userId);
  return false;
}

export async function seedDatabaseIfNeeded(ownerUserId?: string | null): Promise<void> {
  await purgeLegacyGenericCustomers();

  const resolvedOwner =
    ownerUserId !== undefined
      ? ownerUserId
      : ((await db.settings.get(ACTIVE_OWNER_KEY))?.value ?? null);
  const effectiveOwnerId = resolvedOwner === 'local' ? null : resolvedOwner;

  const [
    branchCount,
    productCount,
    customerCount,
    quoteCount,
    expenseCount,
    resetMarker,
    fullWipeEntry,
  ] = await Promise.all([
    db.branches.count(),
    db.products.count(),
    db.customers.count(),
    db.supplierQuotes.count(),
    db.expenses.count(),
    db.settings.get('operationalResetCompleted'),
    db.settings.get('fullDataWipeAt'),
  ]);

  const fullWipeAt = fullWipeEntry?.value || readFullWipeLocalMarker(effectiveOwnerId);

  if (fullWipeAt) {
    // Account has been explicitly wiped clean: NEVER re-seed demo data.
    // Ensure at most 1 clean operational branch exists without demo details.
    if (!fullWipeEntry) {
      await db.settings.put({ key: 'fullDataWipeAt', value: fullWipeAt });
    }
    if (branchCount === 0) {
      await db.branches.put({ ...CLEAN_PRIMARY_BRANCH, updatedAt: fullWipeAt });
    }
  } else {
    if (branchCount === 0) await db.branches.bulkPut(DEFAULT_BRANCHES);
    // Internal users (db.cashiers) are NEVER preloaded — every account starts with 0 internal users.
    if (productCount === 0) await db.products.bulkPut(DEFAULT_PRODUCTS);
    if (customerCount === 0) await db.customers.bulkPut(DEFAULT_CUSTOMERS);
    if (quoteCount === 0) await db.supplierQuotes.bulkPut(DEFAULT_SUPPLIER_QUOTES);
    if (expenseCount === 0 && !resetMarker) await db.expenses.bulkPut(DEFAULT_EXPENSES);
  }

  const existingName = await db.settings.get('businessName');
  if (!existingName) {
    await saveLocalBusinessSettings(DEFAULT_BUSINESS_SETTINGS);
  }
}

export type StockHealthStatus = 'critical' | 'warning' | 'ok';

export interface CategoryValuationItem {
  category: string;
  productCount: number;
  totalUnits: number;
  costValueUsd: number;
  costValueVes: number;
  retailValueUsd: number;
  retailValueVes: number;
  costPercentage: number;
  retailPercentage: number;
}

export interface InventoryHistoryPoint {
  dateKey: string;
  label: string;
  costValueUsd: number;
  costValueVes: number;
  retailValueUsd: number;
  retailValueVes: number;
}

export interface StockAlertItem {
  productId: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minStock: number;
  costUsd: number;
  priceUsd: number;
  costValueUsd: number;
  retailValueUsd: number;
  potentialProfitUsd: number;
  marginPercent: number;
  soldLast30Days: number;
  status: StockHealthStatus;
  suggestedRestockQty: number;
  estimatedRestockCostUsd: number;
}

export interface InventoryValuationSummary {
  branchId: string | 'all';
  branchName: string;
  exchangeRate: number;
  totalCostUsd: number;
  totalCostVes: number;
  totalRetailUsd: number;
  totalRetailVes: number;
  potentialProfitUsd: number;
  potentialProfitVes: number;
  potentialMarginPercent: number;
  activeProductsCount: number;
  productsWithStockCount: number;
  totalUnitsInStock: number;
  categories: CategoryValuationItem[];
  history: InventoryHistoryPoint[];
  costVariationPercent: number;
  retailVariationPercent: number;
  hasHistoricalMovements: boolean;
  stockCounts: {
    critical: number;
    warning: number;
    ok: number;
  };
  items: StockAlertItem[];
  hotLowStockItems: StockAlertItem[];
}

const round2Val = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDayLabel(date: Date): string {
  return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }).replace('.', '');
}

function getStockForScope(
  product: Product,
  branchScope: string | 'all',
  operationalBranchIds: string[]
): number {
  if (branchScope === 'all') {
    if (operationalBranchIds.length > 0) {
      return operationalBranchIds.reduce(
        (sum, bId) => sum + Math.max(0, Number(product.stockByBranch[bId] ?? 0)),
        0
      );
    }
    return Object.values(product.stockByBranch).reduce(
      (sum, qty) => sum + Math.max(0, Number(qty ?? 0)),
      0
    );
  }
  return Math.max(0, Number(product.stockByBranch[branchScope] ?? 0));
}

export function computeInventoryValuationSummary(params: {
  products: Product[];
  branches: Branch[];
  sales: Sale[];
  stockTransfers: StockTransfer[];
  branchId?: string | 'all';
  exchangeRate: number;
  historyDays?: number;
}): InventoryValuationSummary {
  const { products, branches, sales, stockTransfers } = params;
  const safeRate =
    Number.isFinite(params.exchangeRate) && params.exchangeRate > 0
      ? params.exchangeRate
      : DEFAULT_BUSINESS_SETTINGS.exchangeRate;
  const historyDays = Math.max(7, Math.min(90, params.historyDays ?? 30));

  const activeBranches = branches.filter((b) => b.isActive);
  const operationalBranches = activeBranches.length > 0 ? activeBranches : branches;
  const operationalBranchIds = operationalBranches.map((b) => b.id);

  const requestedScope = params.branchId ?? 'all';
  const matchedBranch =
    requestedScope !== 'all' ? branches.find((b) => b.id === requestedScope) : undefined;
  const branchScope: string | 'all' = matchedBranch ? matchedBranch.id : 'all';
  const branchName = matchedBranch ? matchedBranch.name : 'Todas las sucursales';
  const branchMultiplier = branchScope === 'all' ? Math.max(1, operationalBranches.length) : 1;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowStart = new Date(todayMidnight);
  windowStart.setDate(windowStart.getDate() - (historyDays - 1));
  const windowStartMs = windowStart.getTime();

  // Compute 30-day sales velocity and daily net stock deltas per product
  const soldLast30ByProduct = new Map<string, number>();
  const dailyDeltaMap = new Map<string, Map<string, number>>();
  let hasHistoricalMovements = false;

  const addDailyDelta = (dateKey: string, productId: string, delta: number) => {
    if (delta === 0) return;
    let dayMap = dailyDeltaMap.get(dateKey);
    if (!dayMap) {
      dayMap = new Map<string, number>();
      dailyDeltaMap.set(dateKey, dayMap);
    }
    dayMap.set(productId, (dayMap.get(productId) ?? 0) + delta);
    hasHistoricalMovements = true;
  };

  for (const sale of sales) {
    if (branchScope !== 'all' && sale.branchId !== branchScope) continue;
    const saleDate = new Date(sale.createdAt);
    const saleMs = saleDate.getTime();
    if (!Number.isFinite(saleMs) || saleMs < windowStartMs) continue;
    const dateKey = toLocalDateKey(saleDate);

    for (const item of sale.items) {
      const qty = Math.max(0, Number(item.quantity) || 0);
      if (qty <= 0) continue;
      soldLast30ByProduct.set(
        item.productId,
        (soldLast30ByProduct.get(item.productId) ?? 0) + qty
      );
      // A sale decreases inventory on that date
      addDailyDelta(dateKey, item.productId, -qty);
    }
  }

  for (const movement of stockTransfers) {
    const moveDate = new Date(movement.createdAt);
    const moveMs = moveDate.getTime();
    if (!Number.isFinite(moveMs) || moveMs < windowStartMs) continue;
    const qty = Math.max(0, Number(movement.quantity) || 0);
    if (qty <= 0) continue;
    const dateKey = toLocalDateKey(moveDate);

    if (movement.type === 'load') {
      if (branchScope === 'all' || movement.toBranchId === branchScope) {
        addDailyDelta(dateKey, movement.productId, qty);
      }
    } else if (movement.type === 'transfer' && branchScope !== 'all') {
      if (movement.toBranchId === branchScope) {
        addDailyDelta(dateKey, movement.productId, qty);
      }
      if (movement.fromBranchId === branchScope) {
        addDailyDelta(dateKey, movement.productId, -qty);
      }
    }
  }

  let totalCostUsd = 0;
  let totalRetailUsd = 0;
  let productsWithStockCount = 0;
  let totalUnitsInStock = 0;

  const stockCounts = { critical: 0, warning: 0, ok: 0 };
  const categoryAcc = new Map<
    string,
    { productCount: number; totalUnits: number; costValueUsd: number; retailValueUsd: number }
  >();
  const currentStockByProduct = new Map<string, number>();
  const items: StockAlertItem[] = [];

  for (const product of products) {
    const currentStock = getStockForScope(product, branchScope, operationalBranchIds);
    currentStockByProduct.set(product.id, currentStock);

    const safeCost = Math.max(0, Number(product.costUsd) || 0);
    const safePrice = Math.max(0, Number(product.priceUsd) || 0);
    const effectiveMinStock = Math.max(0, (Number(product.minStock) || 0) * branchMultiplier);

    const costValueUsd = round2Val(currentStock * safeCost);
    const retailValueUsd = round2Val(currentStock * safePrice);
    const potentialProfitUsd = round2Val(retailValueUsd - costValueUsd);
    const marginPercent =
      retailValueUsd > 0
        ? round2Val((potentialProfitUsd / retailValueUsd) * 100)
        : safePrice > 0
        ? round2Val(((safePrice - safeCost) / safePrice) * 100)
        : 0;

    if (currentStock > 0) {
      productsWithStockCount += 1;
      totalUnitsInStock += currentStock;
      totalCostUsd = round2Val(totalCostUsd + costValueUsd);
      totalRetailUsd = round2Val(totalRetailUsd + retailValueUsd);
    }

    const categoryName = (product.category || 'General').trim() || 'General';
    const catEntry = categoryAcc.get(categoryName) ?? {
      productCount: 0,
      totalUnits: 0,
      costValueUsd: 0,
      retailValueUsd: 0,
    };
    catEntry.productCount += 1;
    catEntry.totalUnits += currentStock;
    catEntry.costValueUsd = round2Val(catEntry.costValueUsd + costValueUsd);
    catEntry.retailValueUsd = round2Val(catEntry.retailValueUsd + retailValueUsd);
    categoryAcc.set(categoryName, catEntry);

    let status: StockHealthStatus;
    if (
      currentStock <= 0 ||
      (effectiveMinStock > 0 && currentStock <= Math.floor(effectiveMinStock * 0.5))
    ) {
      status = 'critical';
      stockCounts.critical += 1;
    } else if (effectiveMinStock > 0 && currentStock <= effectiveMinStock) {
      status = 'warning';
      stockCounts.warning += 1;
    } else {
      status = 'ok';
      stockCounts.ok += 1;
    }

    const soldLast30Days = soldLast30ByProduct.get(product.id) ?? 0;
    const targetStock = Math.max(
      effectiveMinStock > 0 ? Math.ceil(effectiveMinStock * 1.5) : 10,
      Math.ceil(soldLast30Days * 0.5)
    );
    const suggestedRestockQty =
      status === 'ok' ? 0 : Math.max(1, targetStock - currentStock);
    const estimatedRestockCostUsd = round2Val(suggestedRestockQty * safeCost);

    items.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: categoryName,
      unit: product.unit || 'und',
      currentStock,
      minStock: effectiveMinStock,
      costUsd: safeCost,
      priceUsd: safePrice,
      costValueUsd,
      retailValueUsd,
      potentialProfitUsd,
      marginPercent,
      soldLast30Days,
      status,
      suggestedRestockQty,
      estimatedRestockCostUsd,
    });
  }

  const categories: CategoryValuationItem[] = Array.from(categoryAcc.entries())
    .map(([category, acc]) => ({
      category,
      productCount: acc.productCount,
      totalUnits: acc.totalUnits,
      costValueUsd: acc.costValueUsd,
      costValueVes: round2Val(acc.costValueUsd * safeRate),
      retailValueUsd: acc.retailValueUsd,
      retailValueVes: round2Val(acc.retailValueUsd * safeRate),
      costPercentage:
        totalCostUsd > 0 ? round2Val((acc.costValueUsd / totalCostUsd) * 100) : 0,
      retailPercentage:
        totalRetailUsd > 0 ? round2Val((acc.retailValueUsd / totalRetailUsd) * 100) : 0,
    }))
    .sort((a, b) => b.retailValueUsd - a.retailValueUsd || b.costValueUsd - a.costValueUsd);

  // Reconstruct daily historical valuation backwards from live stock
  const dates: Date[] = [];
  for (let i = 0; i < historyDays; i += 1) {
    const d = new Date(windowStart);
    d.setDate(windowStart.getDate() + i);
    dates.push(d);
  }

  const productPricingMap = new Map<string, { costUsd: number; priceUsd: number }>();
  for (const p of products) {
    productPricingMap.set(p.id, {
      costUsd: Math.max(0, Number(p.costUsd) || 0),
      priceUsd: Math.max(0, Number(p.priceUsd) || 0),
    });
  }

  const rollingStock = new Map<string, number>(currentStockByProduct);
  const historyReversed: InventoryHistoryPoint[] = [];

  for (let i = dates.length - 1; i >= 0; i -= 1) {
    const date = dates[i];
    const dateKey = toLocalDateKey(date);

    let dayCostUsd = 0;
    let dayRetailUsd = 0;
    rollingStock.forEach((qty, prodId) => {
      if (qty <= 0) return;
      const pricing = productPricingMap.get(prodId);
      if (!pricing) return;
      dayCostUsd += qty * pricing.costUsd;
      dayRetailUsd += qty * pricing.priceUsd;
    });

    const roundedDayCost = round2Val(dayCostUsd);
    const roundedDayRetail = round2Val(dayRetailUsd);

    historyReversed.push({
      dateKey,
      label: formatShortDayLabel(date),
      costValueUsd: roundedDayCost,
      costValueVes: round2Val(roundedDayCost * safeRate),
      retailValueUsd: roundedDayRetail,
      retailValueVes: round2Val(roundedDayRetail * safeRate),
    });

    // Reverse this day's movements to obtain previous day's closing stock
    const dayDeltas = dailyDeltaMap.get(dateKey);
    if (dayDeltas) {
      dayDeltas.forEach((delta, prodId) => {
        if (!rollingStock.has(prodId)) return;
        const currentQty = rollingStock.get(prodId) ?? 0;
        rollingStock.set(prodId, Math.max(0, currentQty - delta));
      });
    }
  }

  const history = historyReversed.reverse();
  const firstPoint = history[0];
  const lastPoint = history[history.length - 1];

  const costVariationPercent =
    firstPoint && lastPoint && firstPoint.costValueUsd > 0
      ? round2Val(((lastPoint.costValueUsd - firstPoint.costValueUsd) / firstPoint.costValueUsd) * 100)
      : 0;
  const retailVariationPercent =
    firstPoint && lastPoint && firstPoint.retailValueUsd > 0
      ? round2Val(
          ((lastPoint.retailValueUsd - firstPoint.retailValueUsd) / firstPoint.retailValueUsd) * 100
        )
      : 0;

  const statusRank: Record<StockHealthStatus, number> = {
    critical: 0,
    warning: 1,
    ok: 2,
  };

  const hotLowStockItems = [...items].sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    if (b.soldLast30Days !== a.soldLast30Days) return b.soldLast30Days - a.soldLast30Days;
    const ratioA = a.minStock > 0 ? a.currentStock / a.minStock : a.currentStock;
    const ratioB = b.minStock > 0 ? b.currentStock / b.minStock : b.currentStock;
    if (ratioA !== ratioB) return ratioA - ratioB;
    return a.currentStock - b.currentStock;
  });

  const sortedByRetail = [...items].sort(
    (a, b) => b.retailValueUsd - a.retailValueUsd || b.costValueUsd - a.costValueUsd
  );

  const potentialProfitUsd = round2Val(totalRetailUsd - totalCostUsd);
  const potentialMarginPercent =
    totalRetailUsd > 0 ? round2Val((potentialProfitUsd / totalRetailUsd) * 100) : 0;

  return {
    branchId: branchScope,
    branchName,
    exchangeRate: safeRate,
    totalCostUsd,
    totalCostVes: round2Val(totalCostUsd * safeRate),
    totalRetailUsd,
    totalRetailVes: round2Val(totalRetailUsd * safeRate),
    potentialProfitUsd,
    potentialProfitVes: round2Val(potentialProfitUsd * safeRate),
    potentialMarginPercent,
    activeProductsCount: products.length,
    productsWithStockCount,
    totalUnitsInStock,
    categories,
    history,
    costVariationPercent,
    retailVariationPercent,
    hasHistoricalMovements,
    stockCounts,
    items: sortedByRetail,
    hotLowStockItems,
  };
}

/**
 * Real-time Dexie/IndexedDB query computing inventory valuation by cost and retail price,
 * category breakdown, 30-day historical valuation curve, and critical stock alerts.
 */
export async function getInventoryValuationSummary(options?: {
  branchId?: string | 'all';
  exchangeRate?: number;
  historyDays?: number;
}): Promise<InventoryValuationSummary> {
  const [products, branches, sales, stockTransfers, localSettings] = await Promise.all([
    db.products.toArray(),
    db.branches.toArray(),
    db.sales.toArray(),
    db.stockTransfers.toArray(),
    options?.exchangeRate ? Promise.resolve(null) : getLocalBusinessSettings(),
  ]);

  const effectiveRate =
    options?.exchangeRate && Number.isFinite(options.exchangeRate) && options.exchangeRate > 0
      ? options.exchangeRate
      : localSettings?.exchangeRate ?? DEFAULT_BUSINESS_SETTINGS.exchangeRate;

  return computeInventoryValuationSummary({
    products,
    branches,
    sales,
    stockTransfers,
    branchId: options?.branchId ?? 'all',
    exchangeRate: effectiveRate,
    historyDays: options?.historyDays ?? 30,
  });
}
