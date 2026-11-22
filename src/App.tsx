import React, { useEffect, useMemo, useState } from 'react';
import Dexie, { type EntityTable } from 'dexie';
import {
  Banknote,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  History,
  MessageCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  Branch,
  CartItem,
  Cashier,
  CurrencyMode,
  Customer,
  PaymentMethod,
  Product,
  Sale,
  SalePayment,
  SaleType,
  Shift,
} from './types/pos';

interface SettingEntry {
  key: string;
  value: string;
}

class Pos262Database extends Dexie {
  branches!: EntityTable<Branch, 'id'>;
  products!: EntityTable<Product, 'id'>;
  customers!: EntityTable<Customer, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  shifts!: EntityTable<Shift, 'id'>;
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
  }
}

const db = new Pos262Database();

const DEFAULT_BRANCHES: Branch[] = [
  {
    id: 'branch-centro',
    name: 'Sucursal Centro',
    code: 'SUC-01',
    address: 'Av. Bolívar, Edif. Comercial Local 4',
    phone: '+58 412-5550101',
    isActive: true,
  },
  {
    id: 'branch-este',
    name: 'Sucursal Este',
    code: 'SUC-02',
    address: 'C.C. Plaza Este, Nivel PB Local 12',
    phone: '+58 414-5550202',
    isActive: true,
  },
  {
    id: 'branch-norte',
    name: 'Sucursal Norte',
    code: 'SUC-03',
    address: 'Av. Intercomunal, Galpón 7',
    phone: '+58 424-5550303',
    isActive: true,
  },
];

const DEFAULT_CASHIER: Cashier = {
  id: 'cashier-01',
  name: 'Caja Principal',
  pin: '1234',
  role: 'admin',
  branchId: 'branch-centro',
  isActive: true,
};

const DEFAULT_CUSTOMERS: Customer[] = [
  {
    id: 'cust-final',
    name: 'Consumidor Final',
    documentId: 'V-00000000',
    phone: '',
    creditLimitUsd: 0,
    balanceUsd: 0,
    createdAt: '2026-01-01T08:00:00.000Z',
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
  },
];

const DEFAULT_PRODUCTS: Product[] = [
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
  },
];

const PAYMENT_METHODS: Array<{
  method: PaymentMethod;
  currency: CurrencyMode;
  requiresRef: boolean;
  shortLabel: string;
}> = [
  { method: 'Efectivo Bs', currency: 'VES', requiresRef: false, shortLabel: 'Efectivo Bs' },
  { method: 'Pago Móvil', currency: 'VES', requiresRef: true, shortLabel: 'Pago Móvil' },
  { method: 'Biopago', currency: 'VES', requiresRef: true, shortLabel: 'Biopago' },
  { method: 'Punto de Venta', currency: 'VES', requiresRef: true, shortLabel: 'Punto de Venta' },
  { method: 'Efectivo Divisa $', currency: 'USD', requiresRef: false, shortLabel: 'Divisa $' },
  { method: 'Binance USDT', currency: 'USD', requiresRef: true, shortLabel: 'Binance USDT' },
];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const formatUsd = (amount: number): string =>
  `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatVes = (amount: number): string =>
  `Bs ${amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function buildWhatsAppReceiptText(sale: Sale): string {
  const dateLabel = new Date(sale.createdAt).toLocaleString('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const lines: string[] = [
    `*POS 262 — ${sale.branchName}*`,
    `Recibo: ${sale.receiptNumber}`,
    `Fecha: ${dateLabel}`,
    `Cliente: ${sale.customerName}`,
    `Modalidad: ${sale.saleType === 'cash' ? 'Contado' : 'Crédito'}`,
    `Tasa aplicada: Bs ${sale.exchangeRate.toFixed(2)} / $`,
    '------------------------------',
  ];

  sale.items.forEach((item) => {
    const lineUsd = round2(item.priceUsd * item.quantity);
    const lineVes = round2(lineUsd * sale.exchangeRate);
    lines.push(`${item.quantity}x ${item.name}`);
    lines.push(`   ${formatUsd(lineUsd)} (${formatVes(lineVes)})`);
  });

  lines.push('------------------------------');
  lines.push(`Subtotal: ${formatUsd(sale.subtotalUsd)}`);
  if (sale.taxUsd > 0) {
    lines.push(`IVA (${Math.round(sale.taxRate * 100)}%): ${formatUsd(sale.taxUsd)}`);
  }
  lines.push(`*TOTAL: ${formatUsd(sale.totalUsd)} / ${formatVes(sale.totalVes)}*`);

  if (sale.payments.length > 0) {
    lines.push('Pagos:');
    sale.payments.forEach((p) => {
      const refText = p.reference ? ` [Ref: ${p.reference}]` : '';
      const isVesMethod =
        p.method === 'Efectivo Bs' ||
        p.method === 'Pago Móvil' ||
        p.method === 'Biopago' ||
        p.method === 'Punto de Venta';
      const amountLabel = isVesMethod
        ? `${formatVes(p.amountVes)} (${formatUsd(p.amountUsd)})`
        : `${formatUsd(p.amountUsd)} (${formatVes(p.amountVes)})`;
      lines.push(`• ${p.method}: ${amountLabel}${refText}`);
    });
  }

  if (sale.changeUsd > 0) {
    lines.push(
      `Vuelto: ${formatUsd(sale.changeUsd)} (${formatVes(round2(sale.changeUsd * sale.exchangeRate))})`
    );
  }
  if (sale.pendingUsd > 0) {
    lines.push(
      `Saldo pendiente: ${formatUsd(sale.pendingUsd)} (${formatVes(
        round2(sale.pendingUsd * sale.exchangeRate)
      )})`
    );
    if (sale.dueDate) {
      lines.push(`Vencimiento: ${sale.dueDate}`);
    }
  }
  if (sale.notes) {
    lines.push(`Nota: ${sale.notes}`);
  }
  lines.push('Gracias por su compra en Pos 262.');

  return lines.join('\n');
}

function buildWhatsAppUrl(sale: Sale): string {
  const cleanPhone = (sale.customerPhone || '').replace(/\D/g, '');
  const encodedText = encodeURIComponent(buildWhatsAppReceiptText(sale));
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string>('branch-centro');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  const [currency, setCurrency] = useState<CurrencyMode>('USD');
  const [exchangeRateInput, setExchangeRateInput] = useState<string>('64.50');
  const exchangeRate = useMemo(() => {
    const parsed = parseFloat(exchangeRateInput.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [exchangeRateInput]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cust-final');
  const [applyTax, setApplyTax] = useState<boolean>(false);
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [mobileCartOpen, setMobileCartOpen] = useState<boolean>(false);

  const [showNewCustomerForm, setShowNewCustomerForm] = useState<boolean>(false);
  const [newCustomerName, setNewCustomerName] = useState<string>('');
  const [newCustomerDoc, setNewCustomerDoc] = useState<string>('');
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>('');

  const [checkoutOpen, setCheckoutOpen] = useState<boolean>(false);
  const [saleType, setSaleType] = useState<SaleType>('cash');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('Pago Móvil');
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [creditDueDate, setCreditDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  });
  const [checkoutError, setCheckoutError] = useState<string>('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [copiedReceiptId, setCopiedReceiptId] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState<boolean>(false);

  // PWA install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSInstallGuide, setShowIOSInstallGuide] = useState<boolean>(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);
    setIsIOS(/iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  // Bootstrap IndexedDB with initial seed if empty
  useEffect(() => {
    let active = true;
    async function initDatabase() {
      const [branchCount, productCount, customerCount] = await Promise.all([
        db.branches.count(),
        db.products.count(),
        db.customers.count(),
      ]);

      if (branchCount === 0) {
        await db.branches.bulkPut(DEFAULT_BRANCHES);
      }
      if (productCount === 0) {
        await db.products.bulkPut(DEFAULT_PRODUCTS);
      }
      if (customerCount === 0) {
        await db.customers.bulkPut(DEFAULT_CUSTOMERS);
      }

      const [loadedBranches, loadedProducts, loadedCustomers, loadedSales, rateSetting, branchSetting, currSetting] =
        await Promise.all([
          db.branches.toArray(),
          db.products.toArray(),
          db.customers.toArray(),
          db.sales.orderBy('createdAt').reverse().toArray(),
          db.settings.get('exchangeRate'),
          db.settings.get('activeBranchId'),
          db.settings.get('currencyMode'),
        ]);

      if (!active) return;

      setBranches(loadedBranches);
      setProducts(loadedProducts);
      setCustomers(loadedCustomers);
      setSales(loadedSales);
      if (rateSetting?.value) setExchangeRateInput(rateSetting.value);
      if (branchSetting?.value && loadedBranches.some((b) => b.id === branchSetting.value)) {
        setActiveBranchId(branchSetting.value);
      }
      if (currSetting?.value === 'USD' || currSetting?.value === 'VES') {
        setCurrency(currSetting.value);
      }
      setIsReady(true);
    }

    initDatabase();
    return () => {
      active = false;
    };
  }, []);

  // Online/Offline detection and automatic queue synchronization
  const syncPendingSales = async () => {
    if (!navigator.onLine) return;
    const pendingSales = await db.sales.where('syncStatus').equals('pending').toArray();
    if (pendingSales.length === 0) return;

    setIsSyncing(true);
    const now = new Date().toISOString();
    await Promise.all(
      pendingSales.map((sale) =>
        db.sales.update(sale.id, { syncStatus: 'synced', syncedAt: now })
      )
    );
    const refreshed = await db.sales.orderBy('createdAt').reverse().toArray();
    setSales(refreshed);
    setIsSyncing(false);
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncPendingSales();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const persistSetting = (key: string, value: string) => {
    void db.settings.put({ key, value });
  };

  const handleExchangeRateChange = (val: string) => {
    setExchangeRateInput(val);
    const parsed = parseFloat(val.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      persistSetting('exchangeRate', parsed.toFixed(2));
    }
  };

  const handleBranchChange = (branchId: string) => {
    setActiveBranchId(branchId);
    persistSetting('activeBranchId', branchId);
    setCart([]);
  };

  const handleCurrencyChange = (next: CurrencyMode) => {
    setCurrency(next);
    persistSetting('currencyMode', next);
  };

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === activeBranchId) || branches[0],
    [branches, activeBranchId]
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || customers[0],
    [customers, selectedCustomerId]
  );

  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.category)));
    return ['Todos', ...unique];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'Todos' || product.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        (product.barcode && product.barcode.toLowerCase().includes(q))
      );
    });
  }, [products, searchQuery, selectedCategory]);

  const pendingSyncCount = useMemo(
    () => sales.filter((s) => s.syncStatus === 'pending').length,
    [sales]
  );

  const formatPrimary = (usd: number): string =>
    currency === 'USD' ? formatUsd(usd) : formatVes(round2(usd * exchangeRate));

  const formatSecondary = (usd: number): string =>
    currency === 'USD' ? formatVes(round2(usd * exchangeRate)) : formatUsd(usd);

  const getBranchStock = (product: Product): number =>
    product.stockByBranch[activeBranchId] ?? 0;

  const getCartQuantity = (productId: string): number =>
    cart.find((item) => item.productId === productId)?.quantity ?? 0;

  const addToCart = (product: Product) => {
    const available = getBranchStock(product);
    if (available <= 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= available) return prev;
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          priceUsd: product.priceUsd,
          costUsd: product.costUsd,
          quantity: 1,
          taxExempt: product.taxExempt,
        },
      ];
    });
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    const maxStock = product ? getBranchStock(product) : 9999;

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const nextQty = Math.min(maxStock, item.quantity + delta);
          return { ...item, quantity: nextQty };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const exactMatch = products.find(
      (p) =>
        p.sku.toLowerCase() === q ||
        (p.barcode && p.barcode.toLowerCase() === q)
    );
    if (exactMatch && getBranchStock(exactMatch) > 0) {
      addToCart(exactMatch);
      setSearchQuery('');
    }
  };

  const cartTotals = useMemo(() => {
    const subtotalUsd = round2(
      cart.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0)
    );
    const taxRate = applyTax ? 0.16 : 0;
    const taxableUsd = cart.reduce(
      (sum, item) => sum + (item.taxExempt ? 0 : item.priceUsd * item.quantity),
      0
    );
    const taxUsd = round2(taxableUsd * taxRate);
    const totalUsd = round2(subtotalUsd + taxUsd);
    const totalVes = round2(totalUsd * exchangeRate);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    return { subtotalUsd, taxRate, taxUsd, totalUsd, totalVes, itemCount };
  }, [cart, applyTax, exchangeRate]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newCustomerName.trim();
    const trimmedDoc = newCustomerDoc.trim() || 'V-00000000';
    if (!trimmedName) return;

    const customer: Customer = {
      id: `cust-${Date.now()}`,
      name: trimmedName,
      documentId: trimmedDoc.toUpperCase(),
      phone: newCustomerPhone.trim(),
      creditLimitUsd: 200,
      balanceUsd: 0,
      createdAt: new Date().toISOString(),
    };

    await db.customers.put(customer);
    const updated = await db.customers.toArray();
    setCustomers(updated);
    setSelectedCustomerId(customer.id);
    setNewCustomerName('');
    setNewCustomerDoc('');
    setNewCustomerPhone('');
    setShowNewCustomerForm(false);
  };

  // Checkout helpers
  const activeMethodConfig = useMemo(
    () => PAYMENT_METHODS.find((m) => m.method === selectedMethod) || PAYMENT_METHODS[0],
    [selectedMethod]
  );

  const paidTotalUsd = useMemo(
    () => round2(payments.reduce((sum, p) => sum + p.amountUsd, 0)),
    [payments]
  );

  const remainingUsd = useMemo(
    () => round2(Math.max(0, cartTotals.totalUsd - paidTotalUsd)),
    [cartTotals.totalUsd, paidTotalUsd]
  );

  const changeUsd = useMemo(
    () => round2(Math.max(0, paidTotalUsd - cartTotals.totalUsd)),
    [cartTotals.totalUsd, paidTotalUsd]
  );

  const prefillPaymentInput = (method: PaymentMethod, targetUsd: number) => {
    const config = PAYMENT_METHODS.find((m) => m.method === method);
    if (!config || targetUsd <= 0) {
      setPaymentAmountInput('');
      return;
    }
    const suggested =
      config.currency === 'VES' ? round2(targetUsd * exchangeRate) : round2(targetUsd);
    setPaymentAmountInput(suggested.toFixed(2));
  };

  const openCheckoutModal = () => {
    if (cart.length === 0) return;
    setCompletedSale(null);
    setSaleType('cash');
    setPayments([]);
    setPaymentReference('');
    setCheckoutError('');
    const defaultMethod: PaymentMethod = currency === 'VES' ? 'Pago Móvil' : 'Efectivo Divisa $';
    setSelectedMethod(defaultMethod);
    prefillPaymentInput(defaultMethod, cartTotals.totalUsd);
    setCheckoutOpen(true);
    setMobileCartOpen(false);
  };

  const handleSelectMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setCheckoutError('');
    prefillPaymentInput(method, remainingUsd);
  };

  const buildPaymentEntryFromInput = (): SalePayment | null => {
    const raw = parseFloat(paymentAmountInput.replace(',', '.'));
    if (!Number.isFinite(raw) || raw <= 0) return null;

    const amountUsd =
      activeMethodConfig.currency === 'VES' ? round2(raw / exchangeRate) : round2(raw);
    const amountVes =
      activeMethodConfig.currency === 'VES' ? round2(raw) : round2(raw * exchangeRate);

    return {
      method: selectedMethod,
      amountUsd,
      amountVes,
      reference: paymentReference.trim() || undefined,
    };
  };

  const handleAddPaymentLine = () => {
    const entry = buildPaymentEntryFromInput();
    if (!entry) {
      setCheckoutError('Ingresa un monto válido para agregar el pago.');
      return;
    }
    const nextPayments = [...payments, entry];
    const nextPaid = round2(nextPayments.reduce((s, p) => s + p.amountUsd, 0));
    const nextRemaining = round2(Math.max(0, cartTotals.totalUsd - nextPaid));
    setPayments(nextPayments);
    setPaymentReference('');
    setCheckoutError('');
    prefillPaymentInput(selectedMethod, nextRemaining);
  };

  const handleRemovePaymentLine = (index: number) => {
    const nextPayments = payments.filter((_, idx) => idx !== index);
    const nextPaid = round2(nextPayments.reduce((s, p) => s + p.amountUsd, 0));
    const nextRemaining = round2(Math.max(0, cartTotals.totalUsd - nextPaid));
    setPayments(nextPayments);
    prefillPaymentInput(selectedMethod, nextRemaining);
  };

  const handleConfirmSale = async () => {
    if (!activeBranch || cart.length === 0) return;
    setCheckoutError('');

    if (saleType === 'credit' && selectedCustomerId === 'cust-final') {
      setCheckoutError('Las ventas a crédito requieren seleccionar o crear un cliente registrado.');
      return;
    }

    let finalPayments = [...payments];
    if (finalPayments.length === 0) {
      const quickEntry = buildPaymentEntryFromInput();
      if (quickEntry) {
        finalPayments = [quickEntry];
      }
    }

    const totalPaidUsd = round2(finalPayments.reduce((sum, p) => sum + p.amountUsd, 0));

    if (saleType === 'cash' && totalPaidUsd + 0.01 < cartTotals.totalUsd) {
      setCheckoutError(
        `Faltan ${formatUsd(round2(cartTotals.totalUsd - totalPaidUsd))} (${formatVes(
          round2((cartTotals.totalUsd - totalPaidUsd) * exchangeRate)
        )}) para completar el pago de contado.`
      );
      return;
    }

    const finalPendingUsd =
      saleType === 'credit' ? round2(Math.max(0, cartTotals.totalUsd - totalPaidUsd)) : 0;
    const finalChangeUsd = round2(Math.max(0, totalPaidUsd - cartTotals.totalUsd));

    const now = new Date();
    const receiptNumber = `P262-${String(sales.length + 1).padStart(4, '0')}`;
    const onlineNow = navigator.onLine;

    const newSale: Sale = {
      id: `sale-${now.getTime()}`,
      receiptNumber,
      branchId: activeBranch.id,
      branchName: activeBranch.name,
      cashierId: DEFAULT_CASHIER.id,
      cashierName: DEFAULT_CASHIER.name,
      customerId: selectedCustomer?.id ?? 'cust-final',
      customerName: selectedCustomer?.name ?? 'Consumidor Final',
      customerPhone: selectedCustomer?.phone,
      saleType,
      items: cart,
      exchangeRate,
      subtotalUsd: cartTotals.subtotalUsd,
      taxRate: cartTotals.taxRate,
      taxUsd: cartTotals.taxUsd,
      totalUsd: cartTotals.totalUsd,
      totalVes: cartTotals.totalVes,
      paidUsd: totalPaidUsd,
      pendingUsd: finalPendingUsd,
      changeUsd: finalChangeUsd,
      payments: finalPayments,
      notes: orderNotes.trim() || undefined,
      dueDate: saleType === 'credit' ? creditDueDate : undefined,
      createdAt: now.toISOString(),
      syncStatus: onlineNow ? 'synced' : 'pending',
      syncedAt: onlineNow ? now.toISOString() : undefined,
    };

    // Persist sale, decrement branch stock, and update credit balance atomically in IndexedDB
    await db.transaction('rw', db.sales, db.products, db.customers, async () => {
      await db.sales.put(newSale);

      for (const item of cart) {
        const prod = await db.products.get(item.productId);
        if (prod) {
          const currentStock = prod.stockByBranch[activeBranch.id] ?? 0;
          await db.products.update(prod.id, {
            stockByBranch: {
              ...prod.stockByBranch,
              [activeBranch.id]: Math.max(0, currentStock - item.quantity),
            },
          });
        }
      }

      if (saleType === 'credit' && finalPendingUsd > 0 && selectedCustomer) {
        await db.customers.update(selectedCustomer.id, {
          balanceUsd: round2((selectedCustomer.balanceUsd || 0) + finalPendingUsd),
        });
      }
    });

    const [updatedProducts, updatedCustomers, updatedSales] = await Promise.all([
      db.products.toArray(),
      db.customers.toArray(),
      db.sales.orderBy('createdAt').reverse().toArray(),
    ]);

    setProducts(updatedProducts);
    setCustomers(updatedCustomers);
    setSales(updatedSales);
    setCompletedSale(newSale);
    setCart([]);
    setOrderNotes('');
    setPayments([]);
  };

  const handleCopyReceipt = async (sale: Sale) => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppReceiptText(sale));
      setCopiedReceiptId(sale.id);
      setTimeout(() => setCopiedReceiptId(null), 2000);
    } catch {
      setCopiedReceiptId(null);
    }
  };

  const renderCartContent = () => (
    <div className="flex h-full flex-col bg-white">
      {/* Customer selector & quick creation */}
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="customer-select"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"
          >
            <Users className="h-3.5 w-3.5 text-slate-400" />
            Cliente
          </label>
          <button
            type="button"
            onClick={() => setShowNewCustomerForm((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {showNewCustomerForm ? 'Cancelar' : 'Nuevo cliente'}
          </button>
        </div>

        {!showNewCustomerForm ? (
          <div className="mt-2">
            <select
              id="customer-select"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.documentId})
                </option>
              ))}
            </select>
            {selectedCustomer && selectedCustomer.balanceUsd > 0 && (
              <p className="mt-1.5 text-xs text-amber-700 font-medium tabular-nums">
                Saldo por cobrar: {formatUsd(selectedCustomer.balanceUsd)} ·{' '}
                {formatVes(round2(selectedCustomer.balanceUsd * exchangeRate))}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleCreateCustomer} className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <input
              type="text"
              required
              placeholder="Nombre o razón social *"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Cédula / RIF"
                value={newCustomerDoc}
                onChange={(e) => setNewCustomerDoc(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
              />
              <input
                type="tel"
                placeholder="WhatsApp (58412...)"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Guardar y asignar cliente
            </button>
          </form>
        )}
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-4">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center py-8">
            <ShoppingCart className="h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Carrito vacío</p>
            <p className="mt-1 max-w-[220px] text-xs text-slate-500">
              Selecciona productos del catálogo o escanea un código SKU para iniciar la venta.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cart.map((item) => {
              const lineUsd = round2(item.priceUsd * item.quantity);
              const prod = products.find((p) => p.id === item.productId);
              const maxStock = prod ? getBranchStock(prod) : item.quantity;

              return (
                <li key={item.productId} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
                        {formatPrimary(item.priceUsd)} c/u · {item.sku}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      aria-label={`Eliminar ${item.name}`}
                      className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.productId, -1)}
                        aria-label="Disminuir cantidad"
                        className="flex h-8 w-8 items-center justify-center text-slate-700 hover:bg-slate-200/70 rounded-l-lg transition-colors cursor-pointer"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-9 text-center text-sm font-semibold font-mono tabular-nums text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={item.quantity >= maxStock}
                        onClick={() => updateCartQuantity(item.productId, 1)}
                        aria-label="Aumentar cantidad"
                        className="flex h-8 w-8 items-center justify-center text-slate-700 hover:bg-slate-200/70 rounded-r-lg disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="text-right font-mono tabular-nums">
                      <p className="text-sm font-bold text-slate-900">{formatPrimary(lineUsd)}</p>
                      <p className="text-[11px] text-slate-500">{formatSecondary(lineUsd)}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Options, totals, and Checkout CTA */}
      <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyTax}
              onChange={(e) => setApplyTax(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            Aplicar IVA (16% gravables)
          </label>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              Vaciar
            </button>
          )}
        </div>

        <input
          type="text"
          placeholder="Nota opcional del pedido..."
          value={orderNotes}
          onChange={(e) => setOrderNotes(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
        />

        <div className="space-y-1 text-xs text-slate-600 font-mono tabular-nums">
          <div className="flex items-center justify-between">
            <span>Subtotal ({cartTotals.itemCount} und)</span>
            <span>{formatPrimary(cartTotals.subtotalUsd)}</span>
          </div>
          {applyTax && (
            <div className="flex items-center justify-between">
              <span>IVA (16%)</span>
              <span>{formatPrimary(cartTotals.taxUsd)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
            <span className="font-sans text-sm font-bold text-slate-900">Total a pagar</span>
            <div className="text-right">
              <p className="text-lg font-bold text-slate-900">
                {formatPrimary(cartTotals.totalUsd)}
              </p>
              <p className="text-xs font-medium text-slate-500">
                {formatSecondary(cartTotals.totalUsd)}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={cart.length === 0}
          onClick={openCheckoutModal}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 transition-colors cursor-pointer"
        >
          <CreditCard className="h-4 w-4" />
          Cobrar {cart.length > 0 ? formatPrimary(cartTotals.totalUsd) : ''}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Operational Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 lg:flex-nowrap lg:px-6">
          {/* Brand + Branch Selector */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              Pos 262
            </span>
            <span className="hidden h-4 w-px bg-slate-700 sm:inline-block" aria-hidden="true" />
            <div className="relative flex items-center">
              <Building2 className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
              <select
                aria-label="Seleccionar sucursal"
                value={activeBranchId}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="max-w-[175px] truncate rounded-lg border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-7 text-xs font-semibold text-slate-100 focus:border-emerald-500 focus:outline-none cursor-pointer"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Operational Controls: Online/Offline, Daily Rate, $ / Bs Toggle, History, PWA Install */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Online / Offline status + Sync Queue trigger */}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isOnline
                  ? 'border-emerald-800 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60'
                  : 'border-amber-700 bg-amber-950/70 text-amber-300 hover:bg-amber-900/70'
              }`}
            >
              {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span>{isOnline ? 'En línea' : 'Sin conexión'}</span>
              {pendingSyncCount > 0 && (
                <span className="font-mono tabular-nums text-amber-300">
                  · {pendingSyncCount} pend.
                </span>
              )}
            </button>

            {/* Daily USD Rate Input */}
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs">
              <span className="font-medium text-slate-400 whitespace-nowrap">Tasa Bs/$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                aria-label="Tasa diaria de cambio en Bolívares por Dólar"
                value={exchangeRateInput}
                onChange={(e) => handleExchangeRateChange(e.target.value)}
                className="w-16 bg-transparent text-right font-mono text-xs font-bold tabular-nums text-white focus:outline-none"
              />
            </label>

            {/* Global $ / Bs Currency Toggle */}
            <div
              role="group"
              aria-label="Moneda de visualización"
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 p-0.5 shrink-0"
            >
              <button
                type="button"
                onClick={() => handleCurrencyChange('USD')}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  currency === 'USD'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                $ USD
              </button>
              <button
                type="button"
                onClick={() => handleCurrencyChange('VES')}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  currency === 'VES'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Bs
              </button>
            </div>

            {/* Sales History button */}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ventas ({sales.length})</span>
            </button>

            {/* In-App PWA Install Button */}
            {!isInstalled && (deferredPrompt || isIOS) && (
              <button
                type="button"
                onClick={deferredPrompt ? handleInstallPWA : () => setShowIOSInstallGuide(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Instalar</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Split Operational Workspace */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left: Catalog Search, Category Tabs & Product Grid */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {/* Search + Category Filter Bar */}
          <div className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Buscar por nombre, SKU o código de barras (Enter para agregar)..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
                />
              </div>
              <p className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
                {filteredProducts.length} productos · {activeBranch?.name ?? 'Sucursal'}
              </p>
            </div>

            {/* Category Tabs */}
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {categories.map((category) => {
                const isActive = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Product Grid */}
          <div className="flex-1 overflow-y-auto p-4 pb-24 lg:p-6 lg:pb-6">
            {!isReady ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white p-4"
                  />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-14 text-center">
                <Search className="h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  No se encontraron productos
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Intenta con otro término o selecciona todas las categorías.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('Todos');
                  }}
                  className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => {
                  const stock = getBranchStock(product);
                  const inCartQty = getCartQuantity(product.id);
                  const outOfStock = stock <= 0;
                  const lowStock = stock > 0 && stock <= product.minStock;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addToCart(product)}
                      className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer ${
                        outOfStock
                          ? 'border-slate-200 bg-slate-100/70 opacity-60 cursor-not-allowed'
                          : inCartQty > 0
                          ? 'border-emerald-600 bg-white ring-1 ring-emerald-600/20'
                          : 'border-slate-200 bg-white hover:border-slate-400'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="text-sm font-semibold leading-snug text-slate-900 group-hover:text-emerald-700 transition-colors">
                            {product.name}
                          </h2>
                          {inCartQty > 0 && (
                            <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-emerald-700">
                              ×{inCartQty}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          <span className="font-mono">{product.sku}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{product.category}</span>
                          {product.taxExempt && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>Exento</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="mt-4 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
                        <div className="font-mono tabular-nums">
                          <p className="text-base font-bold text-slate-900">
                            {formatPrimary(product.priceUsd)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatSecondary(product.priceUsd)}
                          </p>
                        </div>

                        <div className="text-right text-xs font-semibold tabular-nums">
                          {outOfStock ? (
                            <span className="text-red-600">Agotado</span>
                          ) : lowStock ? (
                            <span className="text-amber-700">Stock bajo: {stock}</span>
                          ) : (
                            <span className="text-slate-600">Stock: {stock}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right: Desktop Persistent Cart Sidebar */}
        <aside className="hidden w-[380px] shrink-0 border-l border-slate-200 lg:block xl:w-[410px]">
          {renderCartContent()}
        </aside>
      </main>

      {/* Mobile / Tablet Bottom Cart Bar (<= 15% viewport height) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 py-2.5 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="flex flex-1 items-center justify-between rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Carrito ({cartTotals.itemCount})
            </span>
            <span className="font-mono tabular-nums">
              {formatPrimary(cartTotals.totalUsd)}
            </span>
          </button>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={openCheckoutModal}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cobrar
            </button>
          )}
        </div>
      </div>

      {/* Mobile Cart Sheet */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/50 lg:hidden">
          <div className="flex h-full w-full max-w-md flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-bold text-slate-900">
                Carrito ({cartTotals.itemCount})
              </h2>
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                aria-label="Cerrar carrito"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{renderCartContent()}</div>
          </div>
        </div>
      )}

      {/* Checkout & Receipt Modal */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {completedSale ? 'Venta registrada' : 'Finalizar cobro'}
                </h2>
                <p className="text-xs text-slate-500">
                  {activeBranch?.name} · {completedSale ? completedSale.customerName : selectedCustomer?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCheckoutOpen(false);
                  setCompletedSale(null);
                }}
                aria-label="Cerrar ventana de cobro"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {completedSale ? (
              /* Receipt & WhatsApp Sharing View */
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-base font-bold text-slate-900">
                        Recibo {completedSale.receiptNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {completedSale.saleType === 'cash' ? 'Venta de Contado' : 'Venta a Crédito'}
                        <span aria-hidden="true"> · </span>
                        {completedSale.syncStatus === 'synced'
                          ? 'Sincronizada'
                          : 'Guardada offline (pendiente por sincronizar)'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="text-lg font-bold text-slate-900">
                      {formatUsd(completedSale.totalUsd)}
                    </p>
                    <p className="text-xs text-slate-500">{formatVes(completedSale.totalVes)}</p>
                  </div>
                </div>

                {/* Receipt Summary */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {buildWhatsAppReceiptText(completedSale)}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <a
                    href={buildWhatsAppUrl(completedSale)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors sm:col-span-2"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Enviar recibo por WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyReceipt(completedSale)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {copiedReceiptId === completedSale.id ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-600" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar texto
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCheckoutOpen(false);
                    setCompletedSale(null);
                  }}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Nueva venta
                </button>
              </div>
            ) : (
              /* Checkout Form View */
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Summary Banner */}
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono tabular-nums">
                  <div>
                    <p className="font-sans text-xs font-medium text-slate-500">Total en Dólares</p>
                    <p className="mt-0.5 text-xl font-bold text-slate-900">
                      {formatUsd(cartTotals.totalUsd)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-sans text-xs font-medium text-slate-500">
                      Total en Bolívares (Tasa {exchangeRate.toFixed(2)})
                    </p>
                    <p className="mt-0.5 text-xl font-bold text-slate-900">
                      {formatVes(cartTotals.totalVes)}
                    </p>
                  </div>
                </div>

                {/* Contado / Crédito Tabs */}
                <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSaleType('cash');
                      setCheckoutError('');
                    }}
                    className={`rounded-md py-2 text-sm font-semibold transition-colors cursor-pointer ${
                      saleType === 'cash'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Contado
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSaleType('credit');
                      setCheckoutError('');
                    }}
                    className={`rounded-md py-2 text-sm font-semibold transition-colors cursor-pointer ${
                      saleType === 'credit'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Crédito
                  </button>
                </div>

                {/* Credit options */}
                {saleType === 'credit' && (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Cliente asignado al crédito
                      </label>
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => {
                          setSelectedCustomerId(e.target.value);
                          setCheckoutError('');
                        }}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                      >
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.documentId})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Fecha de vencimiento
                      </label>
                      <input
                        type="date"
                        value={creditDueDate}
                        onChange={(e) => setCreditDueDate(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Payment Methods Grid */}
                <div>
                  <p className="text-xs font-semibold text-slate-600">
                    Método de pago {saleType === 'credit' ? '(opcional abono inicial)' : ''}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PAYMENT_METHODS.map((pm) => {
                      const active = selectedMethod === pm.method;
                      const Icon =
                        pm.method === 'Pago Móvil'
                          ? Smartphone
                          : pm.method === 'Punto de Venta' || pm.method === 'Biopago'
                          ? CreditCard
                          : pm.method === 'Binance USDT'
                          ? Wallet
                          : Banknote;

                      return (
                        <button
                          key={pm.method}
                          type="button"
                          onClick={() => handleSelectMethod(pm.method)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition-colors cursor-pointer ${
                            active
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{pm.method}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment Entry Row */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-medium text-slate-600">
                      Monto ({activeMethodConfig.currency === 'VES' ? 'Bs' : 'USD $'})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmountInput}
                      onChange={(e) => setPaymentAmountInput(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-bold tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-xs font-medium text-slate-600">
                      Referencia {activeMethodConfig.requiresRef ? '(últimos 4-6 díg.)' : '(opcional)'}
                    </label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Ej: 482910"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end sm:col-span-3">
                    <button
                      type="button"
                      onClick={handleAddPaymentLine}
                      className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      + Agregar pago
                    </button>
                  </div>
                </div>

                {/* Registered Split Payments List */}
                {payments.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {payments.map((payment, index) => (
                      <div
                        key={`${payment.method}-${index}`}
                        className="flex items-center justify-between px-3.5 py-2 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">{payment.method}</span>
                          {payment.reference && (
                            <span className="ml-2 font-mono text-slate-500">
                              Ref: {payment.reference}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 font-mono tabular-nums">
                          <span className="font-semibold text-slate-900">
                            {formatUsd(payment.amountUsd)} ({formatVes(payment.amountVes)})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePaymentLine(index)}
                            aria-label="Eliminar pago"
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live Balance Breakdown */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs font-mono tabular-nums">
                  <div>
                    <span className="font-sans text-slate-500">Registrado: </span>
                    <span className="font-bold text-slate-900">{formatUsd(paidTotalUsd)}</span>
                  </div>
                  {remainingUsd > 0 ? (
                    <div className="text-amber-700 font-bold">
                      <span className="font-sans font-medium">
                        {saleType === 'credit' ? 'Queda a crédito: ' : 'Faltante: '}
                      </span>
                      {formatUsd(remainingUsd)} ({formatVes(round2(remainingUsd * exchangeRate))})
                    </div>
                  ) : (
                    <div className="text-emerald-700 font-bold">
                      <span className="font-sans font-medium">Vuelto: </span>
                      {formatUsd(changeUsd)} ({formatVes(round2(changeUsd * exchangeRate))})
                    </div>
                  )}
                </div>

                {checkoutError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {checkoutError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmSale()}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {saleType === 'credit' ? 'Registrar crédito' : 'Confirmar venta'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sales History & Offline Sync Queue Modal */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Historial de ventas y cola offline
                </h2>
                <p className="text-xs text-slate-500">
                  {sales.length} operaciones locales en IndexedDB · {pendingSyncCount} pendientes por sincronizar
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pendingSyncCount > 0 && (
                  <button
                    type="button"
                    disabled={!isOnline || isSyncing}
                    onClick={() => void syncPendingSales()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    Sincronizar ahora
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Cerrar historial"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {sales.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    Aún no hay ventas registradas
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Todas las ventas se almacenan localmente en IndexedDB para trabajar sin conexión.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                          <span className="font-mono">{sale.receiptNumber}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="truncate">{sale.customerName}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {sale.branchName} · {sale.saleType === 'cash' ? 'Contado' : 'Crédito'} ·{' '}
                          {new Date(sale.createdAt).toLocaleString('es-VE', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                          {' · '}
                          <span
                            className={
                              sale.syncStatus === 'synced'
                                ? 'font-semibold text-emerald-700'
                                : 'font-semibold text-amber-700'
                            }
                          >
                            {sale.syncStatus === 'synced' ? 'Sincronizada' : 'Pendiente offline'}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <div className="text-left sm:text-right font-mono tabular-nums">
                          <p className="text-sm font-bold text-slate-900">
                            {formatUsd(sale.totalUsd)}
                          </p>
                          <p className="text-[11px] text-slate-500">{formatVes(sale.totalVes)}</p>
                        </div>
                        <a
                          href={buildWhatsAppUrl(sale)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap shrink-0"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari PWA Install Guide Modal */}
      {showIOSInstallGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-bold text-slate-900">Instalar Pos 262 en iOS</h3>
            <p className="mt-2 text-sm text-slate-600">
              1. Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.
              <br />
              2. Desliza y selecciona <strong>Agregar a pantalla de inicio</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSInstallGuide(false)}
              className="mt-4 w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
