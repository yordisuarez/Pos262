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

export const DEFAULT_BRANCHES: Branch[] = [
  {
    id: 'branch-centro',
    name: 'Sucursal Centro',
    code: 'SUC-01',
    address: 'Av. Bolívar, Edif. Comercial Local 4',
    phone: '+58 412-5550101',
    isActive: true,
    syncStatus: 'synced',
  },
  {
    id: 'branch-este',
    name: 'Sucursal Este',
    code: 'SUC-02',
    address: 'C.C. Plaza Este, Nivel PB Local 12',
    phone: '+58 414-5550202',
    isActive: true,
    syncStatus: 'synced',
  },
  {
    id: 'branch-norte',
    name: 'Sucursal Norte',
    code: 'SUC-03',
    address: 'Av. Intercomunal, Galpón 7',
    phone: '+58 424-5550303',
    isActive: true,
    syncStatus: 'synced',
  },
];

export const DEFAULT_CUSTOMERS: Customer[] = [
  {
    id: 'cust-01',
    name: 'María Fernanda Rojas',
    documentId: 'V-19482710',
    phone: '584125551948',
    address: 'Urb. Las Acacias',
    creditLimitUsd: 150,
    balanceUsd: 18.5,
    createdAt: '2026-02-10T10:30:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'cust-02',
    name: 'Inversiones El Valle C.A.',
    documentId: 'J-40918273-1',
    phone: '584145554091',
    address: 'Zona Industrial II',
    creditLimitUsd: 600,
    balanceUsd: 0,
    createdAt: '2026-03-04T14:15:00.000Z',
    syncStatus: 'synced',
  },
];

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod-01',
    sku: 'VIV-101',
    barcode: '759100100101',
    name: 'Harina de Maíz Precocida 1 kg',
    category: 'Víveres',
    priceUsd: 1.45,
    costUsd: 1.05,
    taxExempt: true,
    unit: 'und',
    minStock: 10,
    stockByBranch: { 'branch-centro': 48, 'branch-este': 26, 'branch-norte': 14 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-02',
    sku: 'VIV-102',
    barcode: '759100100102',
    name: 'Arroz Blanco Tipo I 1 kg',
    category: 'Víveres',
    priceUsd: 1.6,
    costUsd: 1.15,
    taxExempt: true,
    unit: 'und',
    minStock: 12,
    stockByBranch: { 'branch-centro': 34, 'branch-este': 19, 'branch-norte': 6 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-03',
    sku: 'VIV-103',
    barcode: '759100100103',
    name: 'Aceite Vegetal Comestible 1 L',
    category: 'Víveres',
    priceUsd: 3.85,
    costUsd: 2.95,
    taxExempt: true,
    unit: 'und',
    minStock: 8,
    stockByBranch: { 'branch-centro': 18, 'branch-este': 5, 'branch-norte': 22 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-04',
    sku: 'VIV-104',
    barcode: '759100100104',
    name: 'Café Molido Gourmet 500 g',
    category: 'Víveres',
    priceUsd: 6.5,
    costUsd: 4.8,
    taxExempt: false,
    unit: 'und',
    minStock: 6,
    stockByBranch: { 'branch-centro': 15, 'branch-este': 11, 'branch-norte': 4 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-05',
    sku: 'BEB-201',
    barcode: '759100200201',
    name: 'Agua Mineral Sin Gas 1.5 L',
    category: 'Bebidas',
    priceUsd: 1.1,
    costUsd: 0.65,
    taxExempt: true,
    unit: 'und',
    minStock: 15,
    stockByBranch: { 'branch-centro': 62, 'branch-este': 40, 'branch-norte': 30 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-06',
    sku: 'BEB-202',
    barcode: '759100200202',
    name: 'Refresco Cola Retornable 2 L',
    category: 'Bebidas',
    priceUsd: 2.25,
    costUsd: 1.55,
    taxExempt: false,
    unit: 'und',
    minStock: 10,
    stockByBranch: { 'branch-centro': 28, 'branch-este': 16, 'branch-norte': 0 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-07',
    sku: 'BEB-203',
    barcode: '759100200203',
    name: 'Malta Enlatada Pack x6',
    category: 'Bebidas',
    priceUsd: 5.4,
    costUsd: 3.9,
    taxExempt: false,
    unit: 'pack',
    minStock: 6,
    stockByBranch: { 'branch-centro': 14, 'branch-este': 9, 'branch-norte': 12 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-08',
    sku: 'SNK-301',
    barcode: '759100300301',
    name: 'Galletas de Chocolate 240 g',
    category: 'Snacks',
    priceUsd: 2.8,
    costUsd: 1.9,
    taxExempt: false,
    unit: 'und',
    minStock: 8,
    stockByBranch: { 'branch-centro': 24, 'branch-este': 18, 'branch-norte': 10 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-09',
    sku: 'SNK-302',
    barcode: '759100300302',
    name: 'Platanitos Salados Artesanales 150 g',
    category: 'Snacks',
    priceUsd: 1.95,
    costUsd: 1.2,
    taxExempt: false,
    unit: 'und',
    minStock: 8,
    stockByBranch: { 'branch-centro': 7, 'branch-este': 22, 'branch-norte': 15 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-10',
    sku: 'LIM-401',
    barcode: '759100400401',
    name: 'Detergente Líquido Concentrado 2 L',
    category: 'Limpieza',
    priceUsd: 5.9,
    costUsd: 4.1,
    taxExempt: false,
    unit: 'und',
    minStock: 6,
    stockByBranch: { 'branch-centro': 19, 'branch-este': 8, 'branch-norte': 11 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-11',
    sku: 'LIM-402',
    barcode: '759100400402',
    name: 'Desinfectante Lavanda 1 L',
    category: 'Limpieza',
    priceUsd: 2.15,
    costUsd: 1.35,
    taxExempt: false,
    unit: 'und',
    minStock: 10,
    stockByBranch: { 'branch-centro': 31, 'branch-este': 14, 'branch-norte': 19 },
    syncStatus: 'synced',
  },
  {
    id: 'prod-12',
    sku: 'PER-501',
    barcode: '759100500501',
    name: 'Jabón de Baño Hidratante x3',
    category: 'Cuidado Personal',
    priceUsd: 3.4,
    costUsd: 2.25,
    taxExempt: false,
    unit: 'pack',
    minStock: 8,
    stockByBranch: { 'branch-centro': 21, 'branch-este': 13, 'branch-norte': 7 },
    syncStatus: 'synced',
  },
];

export const DEFAULT_SUPPLIER_QUOTES: SupplierQuote[] = [
  {
    id: 'quote-01',
    supplierName: 'Distribuidora Alimentos Centro C.A.',
    supplierPhone: '0412-5559001',
    productId: 'prod-01',
    productName: 'Harina de Maíz Precocida 1 kg',
    productSku: 'VIV-101',
    bulkCostUsd: 20.4,
    unitsPerBulk: 20,
    unitCostUsd: 1.02,
    notes: 'Entrega 24h en Sucursal Centro',
    updatedAt: '2026-11-18T10:00:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'quote-02',
    supplierName: 'Mayorista La Gran Despensa',
    supplierPhone: '0414-5558112',
    productId: 'prod-01',
    productName: 'Harina de Maíz Precocida 1 kg',
    productSku: 'VIV-101',
    bulkCostUsd: 21.6,
    unitsPerBulk: 20,
    unitCostUsd: 1.08,
    notes: 'Pago de contado en divisa',
    updatedAt: '2026-11-19T12:00:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'quote-03',
    supplierName: 'Importadora Los Andes',
    supplierPhone: '0424-5557223',
    productId: 'prod-03',
    productName: 'Aceite Vegetal Comestible 1 L',
    productSku: 'VIV-103',
    bulkCostUsd: 34.2,
    unitsPerBulk: 12,
    unitCostUsd: 2.85,
    notes: 'Caja de 12 botellas',
    updatedAt: '2026-11-20T09:30:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'quote-04',
    supplierName: 'Mayorista La Gran Despensa',
    supplierPhone: '0414-5558112',
    productId: 'prod-03',
    productName: 'Aceite Vegetal Comestible 1 L',
    productSku: 'VIV-103',
    bulkCostUsd: 36.0,
    unitsPerBulk: 12,
    unitCostUsd: 3.0,
    notes: 'Retiro en almacén',
    updatedAt: '2026-11-20T14:00:00.000Z',
    syncStatus: 'synced',
  },
];

export const DEFAULT_EXPENSES: Expense[] = [
  {
    id: 'exp-01',
    branchId: 'branch-centro',
    branchName: 'Sucursal Centro',
    type: 'fixed',
    category: 'Alquiler',
    description: 'Alquiler mensual local comercial',
    amountUsd: 450,
    amountVes: 29025,
    exchangeRate: 64.5,
    expenseDate: '2026-01-01',
    cashierId: 'system',
    cashierName: 'Sistema',
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'exp-02',
    branchId: 'branch-centro',
    branchName: 'Sucursal Centro',
    type: 'fixed',
    category: 'Servicios',
    description: 'Electricidad, agua e internet fibra',
    amountUsd: 95,
    amountVes: 6127.5,
    exchangeRate: 64.5,
    expenseDate: '2026-01-01',
    cashierId: 'system',
    cashierName: 'Sistema',
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'exp-03',
    branchId: 'branch-centro',
    branchName: 'Sucursal Centro',
    type: 'variable',
    category: 'Insumos',
    description: 'Bolsas plásticas y rollos térmicos',
    amountUsd: 32,
    amountVes: 2064,
    exchangeRate: 64.5,
    expenseDate: '2026-01-01',
    cashierId: 'system',
    cashierName: 'Sistema',
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    syncStatus: 'synced',
  },
];

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  businessName: 'Comercial 262 Suárez',
  rif: 'J-00000000-0',
  phone: '+58 412-5550101',
  address: 'Av. Bolívar, Edif. Comercial Local 4',
  exchangeRate: 64.5,
  updatedAt: '2026-01-01T08:00:00.000Z',
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
