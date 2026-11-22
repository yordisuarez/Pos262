export type CurrencyMode = 'USD' | 'VES';

export type SaleType = 'cash' | 'credit';

export type SyncStatus = 'synced' | 'pending' | 'failed';

export type PaymentMethod =
  | 'Efectivo Bs'
  | 'Pago Móvil'
  | 'Biopago'
  | 'Punto de Venta'
  | 'Efectivo Divisa $'
  | 'Binance USDT';

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  isActive: boolean;
}

export interface Cashier {
  id: string;
  name: string;
  pin: string;
  role: 'admin' | 'manager' | 'cashier';
  branchId: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  priceUsd: number;
  costUsd: number;
  taxExempt?: boolean;
  unit: string;
  minStock: number;
  stockByBranch: Record<string, number>;
}

export interface Customer {
  id: string;
  name: string;
  documentId: string;
  phone?: string;
  address?: string;
  creditLimitUsd: number;
  balanceUsd: number;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  priceUsd: number;
  costUsd: number;
  quantity: number;
  taxExempt?: boolean;
}

export interface Shift {
  id: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingFundUsd: number;
  openingFundVes: number;
  expectedCashUsd?: number;
  expectedCashVes?: number;
  countedCashUsd?: number;
  countedCashVes?: number;
  status: 'open' | 'closed';
  notes?: string;
}

export interface SalePayment {
  method: PaymentMethod;
  amountUsd: number;
  amountVes: number;
  reference?: string;
}

export interface Sale {
  id: string;
  receiptNumber: string;
  branchId: string;
  branchName: string;
  cashierId: string;
  cashierName: string;
  shiftId?: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  saleType: SaleType;
  items: CartItem[];
  exchangeRate: number;
  subtotalUsd: number;
  taxRate: number;
  taxUsd: number;
  totalUsd: number;
  totalVes: number;
  paidUsd: number;
  pendingUsd: number;
  changeUsd: number;
  payments: SalePayment[];
  notes?: string;
  dueDate?: string;
  createdAt: string;
  syncStatus: SyncStatus;
  syncedAt?: string;
}
