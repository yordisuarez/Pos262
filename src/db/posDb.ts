import Dexie, { type EntityTable } from 'dexie';
import type {
  Branch,
  Cashier,
  Customer,
  Expense,
  Product,
  Sale,
  Shift,
  StockTransfer,
  SupplierQuote,
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
  }
}

export const db = new Pos262Database();

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

export const DEFAULT_CASHIERS: Cashier[] = [
  {
    id: 'cashier-admin',
    name: 'Yordi Suárez (Admin)',
    pin: '0000',
    role: 'admin',
    branchId: 'branch-centro',
    isActive: true,
  },
  {
    id: 'cashier-01',
    name: 'Carlos Méndez',
    pin: '1234',
    role: 'cashier',
    branchId: 'branch-centro',
    isActive: true,
  },
  {
    id: 'cashier-02',
    name: 'Ana Lucía Pérez',
    pin: '5678',
    role: 'manager',
    branchId: 'branch-este',
    isActive: true,
  },
];

export const DEFAULT_CUSTOMERS: Customer[] = [
  {
    id: 'cust-final',
    name: 'Consumidor Final',
    documentId: 'V-00000000',
    phone: '',
    creditLimitUsd: 0,
    balanceUsd: 0,
    createdAt: '2026-01-01T08:00:00.000Z',
    syncStatus: 'synced',
  },
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
    expenseDate: new Date().toISOString().slice(0, 10),
    cashierId: 'cashier-admin',
    cashierName: 'Yordi Suárez (Admin)',
    createdAt: new Date().toISOString(),
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
    expenseDate: new Date().toISOString().slice(0, 10),
    cashierId: 'cashier-admin',
    cashierName: 'Yordi Suárez (Admin)',
    createdAt: new Date().toISOString(),
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
    expenseDate: new Date().toISOString().slice(0, 10),
    cashierId: 'cashier-admin',
    cashierName: 'Yordi Suárez (Admin)',
    createdAt: new Date().toISOString(),
    syncStatus: 'synced',
  },
];

export async function seedDatabaseIfNeeded(): Promise<void> {
  const [branchCount, cashierCount, productCount, customerCount, quoteCount, expenseCount] =
    await Promise.all([
      db.branches.count(),
      db.cashiers.count(),
      db.products.count(),
      db.customers.count(),
      db.supplierQuotes.count(),
      db.expenses.count(),
    ]);

  if (branchCount === 0) await db.branches.bulkPut(DEFAULT_BRANCHES);
  if (cashierCount === 0) await db.cashiers.bulkPut(DEFAULT_CASHIERS);
  if (productCount === 0) await db.products.bulkPut(DEFAULT_PRODUCTS);
  if (customerCount === 0) await db.customers.bulkPut(DEFAULT_CUSTOMERS);
  if (quoteCount === 0) await db.supplierQuotes.bulkPut(DEFAULT_SUPPLIER_QUOTES);
  if (expenseCount === 0) await db.expenses.bulkPut(DEFAULT_EXPENSES);
}

export async function syncAllPendingRecords(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 0;
  }

  const now = new Date().toISOString();

  const [
    pendingSales,
    pendingShifts,
    pendingTransfers,
    pendingCustomers,
    pendingProducts,
    pendingBranches,
    pendingQuotes,
    pendingExpenses,
  ] = await Promise.all([
    db.sales.where('syncStatus').equals('pending').toArray(),
    db.shifts.where('syncStatus').equals('pending').toArray(),
    db.stockTransfers.where('syncStatus').equals('pending').toArray(),
    db.customers.where('syncStatus').equals('pending').toArray(),
    db.products.where('syncStatus').equals('pending').toArray(),
    db.branches.where('syncStatus').equals('pending').toArray(),
    db.supplierQuotes.where('syncStatus').equals('pending').toArray(),
    db.expenses.where('syncStatus').equals('pending').toArray(),
  ]);

  const totalPending =
    pendingSales.length +
    pendingShifts.length +
    pendingTransfers.length +
    pendingCustomers.length +
    pendingProducts.length +
    pendingBranches.length +
    pendingQuotes.length +
    pendingExpenses.length;

  if (totalPending === 0) return 0;

  await db.transaction(
    'rw',
    [
      db.sales,
      db.shifts,
      db.stockTransfers,
      db.customers,
      db.products,
      db.branches,
      db.supplierQuotes,
      db.expenses,
    ],
    async () => {
      await Promise.all([
        ...pendingSales.map((r) => db.sales.update(r.id, { syncStatus: 'synced', syncedAt: now })),
        ...pendingShifts.map((r) => db.shifts.update(r.id, { syncStatus: 'synced', syncedAt: now })),
        ...pendingTransfers.map((r) =>
          db.stockTransfers.update(r.id, { syncStatus: 'synced', syncedAt: now })
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
        ...pendingExpenses.map((r) =>
          db.expenses.update(r.id, { syncStatus: 'synced', syncedAt: now })
        ),
      ]);
    }
  );

  return totalPending;
}
