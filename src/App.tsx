import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  Copy,
  CreditCard,
  Download,
  History,
  Lock,
  MessageCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import {
  DEFAULT_BUSINESS_SETTINGS,
  db,
  getLocalBusinessSettings,
  saveLocalBusinessSettings,
  seedDatabaseIfNeeded,
} from './db/posDb';
import { getSafeSession, supabase } from './lib/supabase';
import {
  buildSyncQueueItem,
  computePendingSyncSummary,
  formatSyncEntityLabel,
  processSyncQueue,
} from './services/syncQueue';
import { CashierLoginModal, ShiftManager } from './components/ShiftManager';
import { InventoryManager } from './components/InventoryManager';
import { ReportsManager } from './components/ReportsManager';
import { CostingManager } from './components/CostingManager';
import { CloudAuthScreen } from './components/CloudAuthScreen';
import { SettingsManager } from './components/SettingsManager';
import type {
  Branch,
  BusinessSettings,
  CartItem,
  Cashier,
  CloudSyncState,
  CurrencyMode,
  Customer,
  Expense,
  ExpenseType,
  PaymentMethod,
  Product,
  Sale,
  SalePayment,
  SaleType,
  Shift,
  StockTransfer,
  SupplierQuote,
  SyncQueueItem,
} from './types/pos';

type WorkspaceTab = 'pos' | 'shifts' | 'inventory' | 'reports' | 'costing' | 'settings';

const RATE_STORAGE_KEY = 'pos_262_exchange_rate';
const OFFLINE_BYPASS_KEY = 'pos_262_offline_auth_bypass';

const PAYMENT_METHODS: Array<{
  method: PaymentMethod;
  currency: CurrencyMode;
  requiresRef: boolean;
}> = [
  { method: 'Efectivo Bs', currency: 'VES', requiresRef: false },
  { method: 'Pago Móvil', currency: 'VES', requiresRef: true },
  { method: 'Biopago', currency: 'VES', requiresRef: true },
  { method: 'Punto de Venta', currency: 'VES', requiresRef: true },
  { method: 'Efectivo Divisa $', currency: 'USD', requiresRef: false },
  { method: 'Binance USDT', currency: 'USD', requiresRef: true },
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

function buildWhatsAppReceiptText(sale: Sale, business?: BusinessSettings): string {
  const dateLabel = new Date(sale.createdAt).toLocaleString('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const businessTitle = business?.businessName || 'Pos 262';
  const lines: string[] = [
    `*${businessTitle} — ${sale.branchName}*`,
    ...(business?.rif ? [`RIF: ${business.rif}`] : []),
    `Recibo: ${sale.receiptNumber}`,
    `Fecha: ${dateLabel}`,
    `Cajero: ${sale.cashierName}`,
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
  lines.push(`Gracias por su compra en ${businessTitle}.`);

  return lines.join('\n');
}

function buildWhatsAppUrl(sale: Sale, business?: BusinessSettings): string {
  const cleanPhone = (sale.customerPhone || '').replace(/\D/g, '');
  const encodedText = encodeURIComponent(buildWhatsAppReceiptText(sale, business));
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [offlineAuthBypass, setOfflineAuthBypass] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OFFLINE_BYPASS_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [cloudAuthModalOpen, setCloudAuthModalOpen] = useState<boolean>(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(
    DEFAULT_BUSINESS_SETTINGS
  );

  const cloudUserIdRef = useRef<string | null>(null);
  const rateSyncTimerRef = useRef<number | null>(null);

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('pos');

  // Persisted IndexedDB collections
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [supplierQuotes, setSupplierQuotes] = useState<SupplierQuote[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);

  // Active session state
  const [activeCashier, setActiveCashier] = useState<Cashier | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);
  const [activeBranchId, setActiveBranchId] = useState<string>('branch-centro');

  // Global currency & persisted offline USD->Bs rate
  const [currency, setCurrency] = useState<CurrencyMode>('USD');
  const [exchangeRateInput, setExchangeRateInput] = useState<string>(() => {
    try {
      return localStorage.getItem(RATE_STORAGE_KEY) || '64.50';
    } catch {
      return '64.50';
    }
  });
  const exchangeRate = useMemo(() => {
    const parsed = parseFloat(exchangeRateInput.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [exchangeRateInput]);

  // POS Catalog & Cart state
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

  // Checkout Modal state
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
  const [historyTab, setHistoryTab] = useState<'queue' | 'sales'>('queue');

  // PWA Install Prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSInstallGuide, setShowIOSInstallGuide] = useState<boolean>(false);

  const reloadAllData = useCallback(async () => {
    const [
      loadedBranches,
      loadedCashiers,
      loadedProducts,
      loadedCustomers,
      loadedSales,
      loadedShifts,
      loadedTransfers,
      loadedQuotes,
      loadedExpenses,
      loadedSyncQueue,
      loadedBusinessSettings,
    ] = await Promise.all([
      db.branches.toArray(),
      db.cashiers.toArray(),
      db.products.toArray(),
      db.customers.toArray(),
      db.sales.orderBy('createdAt').reverse().toArray(),
      db.shifts.orderBy('openedAt').reverse().toArray(),
      db.stockTransfers.orderBy('createdAt').reverse().toArray(),
      db.supplierQuotes.orderBy('updatedAt').reverse().toArray(),
      db.expenses.orderBy('createdAt').reverse().toArray(),
      db.syncQueue.orderBy('timestamp').reverse().toArray(),
      getLocalBusinessSettings(),
    ]);

    setBranches(loadedBranches);
    setCashiers(loadedCashiers);
    setProducts(loadedProducts);
    setCustomers(loadedCustomers);
    setSales(loadedSales);
    setShifts(loadedShifts);
    setTransfers(loadedTransfers);
    setSupplierQuotes(loadedQuotes);
    setExpenses(loadedExpenses);
    setSyncQueue(loadedSyncQueue);
    setBusinessSettings(loadedBusinessSettings);

    if (loadedBusinessSettings.exchangeRate > 0) {
      const normalized = loadedBusinessSettings.exchangeRate.toFixed(2);
      setExchangeRateInput(normalized);
      try {
        localStorage.setItem(RATE_STORAGE_KEY, normalized);
      } catch {
        // Ignore storage quota errors
      }
    }

    return { loadedBranches, loadedCashiers, loadedBusinessSettings };
  }, []);

  const showTemporarySyncNotice = useCallback((message: string) => {
    setSyncNotice(message);
    window.setTimeout(() => {
      setSyncNotice((prev) => (prev === message ? null : prev));
    }, 4000);
  }, []);

  const triggerSyncQueue = useCallback(
    async (mode: 'auto' | 'manual' = 'auto', overrideUserId?: string | null) => {
      const targetUserId = overrideUserId !== undefined ? overrideUserId : cloudUserIdRef.current;

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (mode === 'manual') {
          showTemporarySyncNotice(
            'Modo Offline. Los cambios pendientes se sincronizarán al reconectar.'
          );
        }
        return null;
      }

      if (!targetUserId) {
        if (mode === 'manual') {
          showTemporarySyncNotice('Vincula tu cuenta en Configuración para sincronizar en la nube.');
        }
        return null;
      }

      setIsSyncing(true);
      try {
        const result = await processSyncQueue({
          userId: targetUserId,
          pullFromCloud: true,
        });

        if (result.ok) {
          setLastSyncError(null);
          await reloadAllData();
          if (result.syncedAt) {
            setLastSyncedAt(result.syncedAt);
          }

          if (result.pushedCount > 0 || result.pulledCount > 0) {
            showTemporarySyncNotice(
              `Nube sincronizada (${result.pushedCount} subidos · ${result.pulledCount} actualizados).`
            );
          } else if (mode === 'manual') {
            showTemporarySyncNotice('Todo está sincronizado con Supabase.');
          }
        } else if (result.reason === 'error') {
          setLastSyncError(result.errorMessage || 'No se pudo conectar con Supabase.');
          if (mode === 'manual') {
            showTemporarySyncNotice(
              `No se pudo sincronizar ahora: ${result.errorMessage || 'revisa tu conexión'}.`
            );
          }
        }
        return result;
      } finally {
        setIsSyncing(false);
      }
    },
    [reloadAllData, showTemporarySyncNotice]
  );

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

  useEffect(() => {
    let active = true;

    async function init() {
      await seedDatabaseIfNeeded();
      const { loadedBranches, loadedCashiers } = await reloadAllData();
      const [branchSetting, currSetting, cashierSetting, syncedSetting] = await Promise.all([
        db.settings.get('activeBranchId'),
        db.settings.get('currencyMode'),
        db.settings.get('activeCashierId'),
        db.settings.get('lastSyncedAt'),
      ]);

      const { user } = await getSafeSession();

      if (!active) return;

      cloudUserIdRef.current = user?.id ?? null;
      setCloudUser(user);
      setAuthChecked(true);

      if (branchSetting?.value && loadedBranches.some((b) => b.id === branchSetting.value)) {
        setActiveBranchId(branchSetting.value);
      }
      if (currSetting?.value === 'USD' || currSetting?.value === 'VES') {
        setCurrency(currSetting.value);
      }
      if (syncedSetting?.value) {
        setLastSyncedAt(syncedSetting.value);
      }
      if (cashierSetting?.value) {
        const found = loadedCashiers.find((c) => c.id === cashierSetting.value);
        if (found) setActiveCashier(found);
      } else {
        setLoginModalOpen(true);
      }

      setIsReady(true);

      if (user && navigator.onLine) {
        await triggerSyncQueue('auto', user.id);
      }
    }

    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      cloudUserIdRef.current = nextUser?.id ?? null;
      setCloudUser(nextUser);
      setAuthChecked(true);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      if (rateSyncTimerRef.current !== null) {
        window.clearTimeout(rateSyncTimerRef.current);
      }
    };
  }, [reloadAllData, triggerSyncQueue]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void triggerSyncQueue('auto');
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        setIsOnline(true);
        void triggerSyncQueue('auto');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerSyncQueue]);

  const persistSetting = (key: string, value: string) => {
    void db.settings.put({ key, value });
  };

  const handleExchangeRateChange = (val: string) => {
    setExchangeRateInput(val);
    const parsed = parseFloat(val.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      const rounded = round2(parsed);
      const normalized = rounded.toFixed(2);
      const nowIso = new Date().toISOString();
      const updatedSettings: BusinessSettings = {
        ...businessSettings,
        exchangeRate: rounded,
        updatedAt: nowIso,
        syncStatus: 'pending',
      };
      setBusinessSettings(updatedSettings);
      void saveLocalBusinessSettings(updatedSettings);
      try {
        localStorage.setItem(RATE_STORAGE_KEY, normalized);
      } catch {
        // Ignore storage quota errors
      }

      if (rateSyncTimerRef.current !== null) {
        window.clearTimeout(rateSyncTimerRef.current);
      }
      if (cloudUserIdRef.current && navigator.onLine) {
        rateSyncTimerRef.current = window.setTimeout(() => {
          void triggerSyncQueue('auto');
        }, 900);
      }
    }
  };

  const handleSaveBusinessSettings = async (next: {
    businessName: string;
    rif: string;
    phone: string;
    address: string;
    exchangeRate: number;
  }) => {
    const nowIso = new Date().toISOString();
    const updated: BusinessSettings = {
      businessName: next.businessName,
      rif: next.rif,
      phone: next.phone,
      address: next.address,
      exchangeRate: round2(next.exchangeRate),
      updatedAt: nowIso,
      syncStatus: 'pending',
    };

    const queueItem = buildSyncQueueItem({
      entityType: 'businessSettings',
      entityId: 'business_settings',
      operation: 'update',
      summary: `Ajustes: ${updated.businessName} (Tasa Bs ${updated.exchangeRate.toFixed(2)})`,
      timestamp: nowIso,
    });

    await saveLocalBusinessSettings(updated);
    await db.syncQueue.put(queueItem);

    try {
      localStorage.setItem(RATE_STORAGE_KEY, updated.exchangeRate.toFixed(2));
    } catch {
      // Ignore storage quota errors
    }

    await reloadAllData();
    if (navigator.onLine && cloudUserIdRef.current) {
      await triggerSyncQueue('auto');
    }
  };

  const handleCloudAuthSuccess = async (user: User, registeredBusinessName?: string) => {
    cloudUserIdRef.current = user.id;
    setCloudUser(user);
    setCloudAuthModalOpen(false);
    setOfflineAuthBypass(false);
    try {
      localStorage.removeItem(OFFLINE_BYPASS_KEY);
    } catch {
      // Ignore storage errors
    }

    if (registeredBusinessName && registeredBusinessName.trim()) {
      const current = await getLocalBusinessSettings();
      await saveLocalBusinessSettings({
        ...current,
        businessName: registeredBusinessName.trim(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });
    }

    if (!activeCashier) {
      setLoginModalOpen(true);
    }

    await triggerSyncQueue('auto', user.id);
  };

  const handleContinueOffline = () => {
    setOfflineAuthBypass(true);
    setCloudAuthModalOpen(false);
    try {
      localStorage.setItem(OFFLINE_BYPASS_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
    if (!activeCashier) {
      setLoginModalOpen(true);
    }
  };

  const handleSignOutCloud = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if offline, clear local cloud session reference
    }
    cloudUserIdRef.current = null;
    setCloudUser(null);
    setLastSyncError(null);
    setOfflineAuthBypass(true);
    try {
      localStorage.setItem(OFFLINE_BYPASS_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
    showTemporarySyncNotice('Sesión nube cerrada. Tus datos siguen disponibles offline en este equipo.');
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

  const handleCashierLogin = (cashier: Cashier) => {
    setActiveCashier(cashier);
    persistSetting('activeCashierId', cashier.id);
    setActiveBranchId(cashier.branchId);
    persistSetting('activeBranchId', cashier.branchId);
    setLoginModalOpen(false);
  };

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === activeBranchId) || branches[0],
    [branches, activeBranchId]
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || customers[0],
    [customers, selectedCustomerId]
  );

  const activeShift = useMemo(
    () =>
      shifts.find(
        (s) =>
          s.status === 'open' &&
          s.branchId === activeBranchId &&
          (!activeCashier || s.cashierId === activeCashier.id)
      ) || null,
    [shifts, activeBranchId, activeCashier]
  );

  const pendingSyncSummary = useMemo(
    () =>
      computePendingSyncSummary({
        sales,
        shifts,
        transfers,
        expenses,
        customers,
        products,
        supplierQuotes,
        syncQueue,
        businessSettings,
      }),
    [sales, shifts, transfers, expenses, customers, products, supplierQuotes, syncQueue, businessSettings]
  );

  const cloudSyncState: CloudSyncState = useMemo(() => {
    if (!isOnline) return 'offline';
    if (isSyncing) return 'syncing';
    if (!cloudUser) return 'local';
    if (lastSyncError) return 'error';
    if (pendingSyncSummary.total > 0) return 'pending';
    return 'synced';
  }, [isOnline, isSyncing, cloudUser, lastSyncError, pendingSyncSummary.total]);

  // Shift Handlers
  const handleOpenShift = async (params: {
    openingFundUsd: number;
    openingFundVes: number;
    openingNote?: string;
  }) => {
    if (!activeCashier || !activeBranch) return;
    const now = new Date().toISOString();

    const newShift: Shift = {
      id: `shift-${Date.now()}`,
      branchId: activeBranch.id,
      branchName: activeBranch.name,
      cashierId: activeCashier.id,
      cashierName: activeCashier.name,
      cashierRole: activeCashier.role,
      openedAt: now,
      updatedAt: now,
      openingFundUsd: params.openingFundUsd,
      openingFundVes: params.openingFundVes,
      openingNote: params.openingNote,
      status: 'open',
      syncStatus: 'pending',
    };

    const queueItem = buildSyncQueueItem({
      entityType: 'shift',
      entityId: newShift.id,
      operation: 'open',
      summary: `Apertura turno ${activeBranch.name} (${activeCashier.name})`,
      timestamp: now,
    });

    await db.transaction('rw', [db.shifts, db.syncQueue], async () => {
      await db.shifts.put(newShift);
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  const handleCloseShift = async (params: {
    shiftId: string;
    countedCashUsd: number;
    countedCashVes: number;
    expectedCashUsd: number;
    expectedCashVes: number;
    digitalTotalUsd: number;
    creditTotalUsd: number;
    salesCount: number;
    closingNote?: string;
  }) => {
    const now = new Date().toISOString();
    const targetShift = shifts.find((s) => s.id === params.shiftId);

    const queueItem = buildSyncQueueItem({
      entityType: 'shift',
      entityId: params.shiftId,
      operation: 'close',
      summary: `Cierre turno ${targetShift?.branchName ?? activeBranch?.name ?? ''} (${params.salesCount} ventas)`,
      timestamp: now,
    });

    await db.transaction('rw', [db.shifts, db.syncQueue], async () => {
      await db.shifts.update(params.shiftId, {
        closedAt: now,
        updatedAt: now,
        status: 'closed',
        countedCashUsd: params.countedCashUsd,
        countedCashVes: params.countedCashVes,
        expectedCashUsd: params.expectedCashUsd,
        expectedCashVes: params.expectedCashVes,
        diffUsd: round2(params.countedCashUsd - params.expectedCashUsd),
        diffVes: round2(params.countedCashVes - params.expectedCashVes),
        digitalTotalUsd: params.digitalTotalUsd,
        creditTotalUsd: params.creditTotalUsd,
        salesCount: params.salesCount,
        closingNote: params.closingNote,
        syncStatus: 'pending',
        syncedAt: undefined,
      });
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  // Multi-Branch Stock Load & Transfer Handlers
  const handleLoadStock = async (params: {
    branchId: string;
    productId: string;
    quantity: number;
    notes?: string;
  }) => {
    if (!activeCashier) return;
    const targetBranch = branches.find((b) => b.id === params.branchId);
    const targetProduct = products.find((p) => p.id === params.productId);
    if (!targetBranch || !targetProduct) return;

    const now = new Date().toISOString();

    const movement: StockTransfer = {
      id: `mov-${Date.now()}`,
      type: 'load',
      productId: targetProduct.id,
      productName: targetProduct.name,
      productSku: targetProduct.sku,
      toBranchId: targetBranch.id,
      toBranchName: targetBranch.name,
      quantity: params.quantity,
      cashierId: activeCashier.id,
      cashierName: activeCashier.name,
      notes: params.notes,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    const queueItem = buildSyncQueueItem({
      entityType: 'stockTransfer',
      entityId: movement.id,
      operation: 'load',
      summary: `Carga +${params.quantity} und ${targetProduct.sku} en ${targetBranch.name}`,
      timestamp: now,
    });

    await db.transaction('rw', [db.products, db.stockTransfers, db.syncQueue], async () => {
      const freshProd = await db.products.get(targetProduct.id);
      if (!freshProd) return;
      const currentQty = freshProd.stockByBranch[targetBranch.id] ?? 0;
      await db.products.update(freshProd.id, {
        stockByBranch: {
          ...freshProd.stockByBranch,
          [targetBranch.id]: currentQty + params.quantity,
        },
        updatedAt: now,
        syncStatus: 'pending',
        syncedAt: undefined,
      });
      await db.stockTransfers.put(movement);
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  const handleTransferStock = async (params: {
    fromBranchId: string;
    toBranchId: string;
    productId: string;
    quantity: number;
    notes?: string;
  }) => {
    if (!activeCashier) return;
    const fromBranch = branches.find((b) => b.id === params.fromBranchId);
    const toBranch = branches.find((b) => b.id === params.toBranchId);
    const targetProduct = products.find((p) => p.id === params.productId);
    if (!fromBranch || !toBranch || !targetProduct) return;

    const now = new Date().toISOString();

    const movement: StockTransfer = {
      id: `trf-${Date.now()}`,
      type: 'transfer',
      productId: targetProduct.id,
      productName: targetProduct.name,
      productSku: targetProduct.sku,
      fromBranchId: fromBranch.id,
      fromBranchName: fromBranch.name,
      toBranchId: toBranch.id,
      toBranchName: toBranch.name,
      quantity: params.quantity,
      cashierId: activeCashier.id,
      cashierName: activeCashier.name,
      notes: params.notes,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    const queueItem = buildSyncQueueItem({
      entityType: 'stockTransfer',
      entityId: movement.id,
      operation: 'transfer',
      summary: `Traslado ${params.quantity} und ${targetProduct.sku} (${fromBranch.name} → ${toBranch.name})`,
      timestamp: now,
    });

    await db.transaction('rw', [db.products, db.stockTransfers, db.syncQueue], async () => {
      const freshProd = await db.products.get(targetProduct.id);
      if (!freshProd) return;
      const sourceQty = freshProd.stockByBranch[fromBranch.id] ?? 0;
      const destQty = freshProd.stockByBranch[toBranch.id] ?? 0;
      if (sourceQty < params.quantity) return;

      await db.products.update(freshProd.id, {
        stockByBranch: {
          ...freshProd.stockByBranch,
          [fromBranch.id]: sourceQty - params.quantity,
          [toBranch.id]: destQty + params.quantity,
        },
        updatedAt: now,
        syncStatus: 'pending',
        syncedAt: undefined,
      });
      await db.stockTransfers.put(movement);
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  // Receivable settlement handler
  const handleSettleReceivable = async (saleId: string, amountUsd: number) => {
    const sale = await db.sales.get(saleId);
    if (!sale || sale.pendingUsd <= 0) return;

    const now = new Date().toISOString();
    const appliedUsd = round2(Math.min(sale.pendingUsd, amountUsd));
    const nextPending = round2(Math.max(0, sale.pendingUsd - appliedUsd));
    const nextPaid = round2(sale.paidUsd + appliedUsd);

    const queueItem = buildSyncQueueItem({
      entityType: 'sale',
      entityId: sale.id,
      operation: 'update',
      summary: `Cobro crédito ${sale.receiptNumber} (${formatUsd(appliedUsd)})`,
      timestamp: now,
    });

    await db.transaction('rw', [db.sales, db.customers, db.syncQueue], async () => {
      await db.sales.update(sale.id, {
        paidUsd: nextPaid,
        pendingUsd: nextPending,
        updatedAt: now,
        payments: [
          ...sale.payments,
          {
            method: 'Efectivo Divisa $',
            amountUsd: appliedUsd,
            amountVes: round2(appliedUsd * exchangeRate),
            reference: 'Cobro de crédito',
          },
        ],
        syncStatus: 'pending',
        syncedAt: undefined,
      });

      const customer = await db.customers.get(sale.customerId);
      if (customer) {
        await db.customers.update(customer.id, {
          balanceUsd: round2(Math.max(0, customer.balanceUsd - appliedUsd)),
          updatedAt: now,
          syncStatus: 'pending',
          syncedAt: undefined,
        });
      }

      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  // Bulk Pricing, Suppliers & Expenses Handlers
  const handleUpdateProductPricing = async (
    productId: string,
    costUsd: number,
    priceUsd: number
  ) => {
    const now = new Date().toISOString();
    const product = products.find((p) => p.id === productId);

    const queueItem = buildSyncQueueItem({
      entityType: 'product',
      entityId: productId,
      operation: 'update',
      summary: `Precio ${product?.sku ?? productId}: ${formatUsd(priceUsd)}`,
      timestamp: now,
    });

    await db.transaction('rw', [db.products, db.syncQueue], async () => {
      await db.products.update(productId, {
        costUsd: round2(costUsd),
        priceUsd: round2(priceUsd),
        updatedAt: now,
        syncStatus: 'pending',
        syncedAt: undefined,
      });
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  const handleAddSupplierQuote = async (params: {
    supplierName: string;
    supplierPhone?: string;
    productId: string;
    bulkCostUsd: number;
    unitsPerBulk: number;
    notes?: string;
  }) => {
    const product = products.find((p) => p.id === params.productId);
    if (!product) return;

    const now = new Date().toISOString();
    const quote: SupplierQuote = {
      id: `quote-${Date.now()}`,
      supplierName: params.supplierName,
      supplierPhone: params.supplierPhone,
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      bulkCostUsd: round2(params.bulkCostUsd),
      unitsPerBulk: params.unitsPerBulk,
      unitCostUsd: round2(params.bulkCostUsd / params.unitsPerBulk),
      notes: params.notes,
      updatedAt: now,
      syncStatus: 'pending',
    };

    const queueItem = buildSyncQueueItem({
      entityType: 'supplierQuote',
      entityId: quote.id,
      operation: 'create',
      summary: `Cotización ${quote.supplierName} (${product.sku})`,
      timestamp: now,
    });

    await db.transaction('rw', [db.supplierQuotes, db.syncQueue], async () => {
      await db.supplierQuotes.put(quote);
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  const handleDeleteSupplierQuote = async (quoteId: string) => {
    const existing = supplierQuotes.find((q) => q.id === quoteId);
    const now = new Date().toISOString();
    const queueItem = buildSyncQueueItem({
      entityType: 'supplierQuote',
      entityId: quoteId,
      operation: 'delete',
      summary: `Eliminar cotización ${existing?.supplierName ?? quoteId}`,
      timestamp: now,
    });

    await db.transaction('rw', [db.supplierQuotes, db.syncQueue], async () => {
      await db.supplierQuotes.delete(quoteId);
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  const handleAddExpense = async (params: {
    branchId: string;
    type: ExpenseType;
    category: string;
    description: string;
    amountUsd: number;
    expenseDate: string;
    notes?: string;
  }) => {
    if (!activeCashier) return;
    const branch = branches.find((b) => b.id === params.branchId) || activeBranch;
    if (!branch) return;

    const now = new Date().toISOString();
    const expense: Expense = {
      id: `exp-${Date.now()}`,
      branchId: branch.id,
      branchName: branch.name,
      type: params.type,
      category: params.category,
      description: params.description,
      amountUsd: round2(params.amountUsd),
      amountVes: round2(params.amountUsd * exchangeRate),
      exchangeRate,
      expenseDate: params.expenseDate,
      cashierId: activeCashier.id,
      cashierName: activeCashier.name,
      notes: params.notes,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    const queueItem = buildSyncQueueItem({
      entityType: 'expense',
      entityId: expense.id,
      operation: 'create',
      summary: `Gasto ${expense.type === 'fixed' ? 'fijo' : 'variable'}: ${expense.description} (${formatUsd(expense.amountUsd)})`,
      timestamp: now,
    });

    await db.transaction('rw', [db.expenses, db.syncQueue], async () => {
      await db.expenses.put(expense);
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const existing = expenses.find((e) => e.id === expenseId);
    const now = new Date().toISOString();
    const queueItem = buildSyncQueueItem({
      entityType: 'expense',
      entityId: expenseId,
      operation: 'delete',
      summary: `Eliminar gasto: ${existing?.description ?? expenseId}`,
      timestamp: now,
    });

    await db.transaction('rw', [db.expenses, db.syncQueue], async () => {
      await db.expenses.delete(expenseId);
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
  };

  // Catalog & Cart helpers
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

    const now = new Date().toISOString();
    const customer: Customer = {
      id: `cust-${Date.now()}`,
      name: trimmedName,
      documentId: trimmedDoc.toUpperCase(),
      phone: newCustomerPhone.trim(),
      creditLimitUsd: 200,
      balanceUsd: 0,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    const queueItem = buildSyncQueueItem({
      entityType: 'customer',
      entityId: customer.id,
      operation: 'create',
      summary: `Nuevo cliente: ${customer.name} (${customer.documentId})`,
      timestamp: now,
    });

    await db.transaction('rw', [db.customers, db.syncQueue], async () => {
      await db.customers.put(customer);
      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    if (navigator.onLine) {
      await triggerSyncQueue('auto');
    }
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
    if (!activeBranch || !activeCashier || cart.length === 0) return;
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
    const nowIso = now.toISOString();
    const receiptNumber = `P262-${String(sales.length + 1).padStart(4, '0')}`;

    const newSale: Sale = {
      id: `sale-${now.getTime()}`,
      receiptNumber,
      branchId: activeBranch.id,
      branchName: activeBranch.name,
      cashierId: activeCashier.id,
      cashierName: activeCashier.name,
      shiftId: activeShift?.id,
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
      createdAt: nowIso,
      updatedAt: nowIso,
      syncStatus: 'pending',
    };

    const queueItem = buildSyncQueueItem({
      entityType: 'sale',
      entityId: newSale.id,
      operation: 'create',
      summary: `Venta ${receiptNumber} (${saleType === 'cash' ? 'Contado' : 'Crédito'}) ${formatUsd(newSale.totalUsd)}`,
      timestamp: nowIso,
    });

    await db.transaction('rw', [db.sales, db.products, db.customers, db.syncQueue], async () => {
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
            updatedAt: nowIso,
            syncStatus: 'pending',
            syncedAt: undefined,
          });
        }
      }

      if (saleType === 'credit' && finalPendingUsd > 0 && selectedCustomer) {
        await db.customers.update(selectedCustomer.id, {
          balanceUsd: round2((selectedCustomer.balanceUsd || 0) + finalPendingUsd),
          updatedAt: nowIso,
          syncStatus: 'pending',
          syncedAt: undefined,
        });
      }

      await db.syncQueue.put(queueItem);
    });

    await reloadAllData();
    let finalSaleRecord = newSale;
    if (navigator.onLine) {
      const syncResult = await triggerSyncQueue('auto');
      if (syncResult?.ok && syncResult.syncedAt) {
        finalSaleRecord = {
          ...newSale,
          syncStatus: 'synced',
          syncedAt: syncResult.syncedAt,
        };
      }
    }

    setCompletedSale(finalSaleRecord);
    setCart([]);
    setOrderNotes('');
    setPayments([]);
  };

  const handleCopyReceipt = async (sale: Sale) => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppReceiptText(sale, businessSettings));
      setCopiedReceiptId(sale.id);
      setTimeout(() => setCopiedReceiptId(null), 2000);
    } catch {
      setCopiedReceiptId(null);
    }
  };

  const renderCartContent = () => (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-3.5 py-2.5">
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
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-[#558B00] hover:bg-[#F7FEE7] hover:text-[#3F6212] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {showNewCustomerForm ? 'Cancelar' : 'Nuevo'}
          </button>
        </div>

        {!showNewCustomerForm ? (
          <div className="mt-1.5">
            <select
              id="customer-select"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.documentId})
                </option>
              ))}
            </select>
            {selectedCustomer && selectedCustomer.balanceUsd > 0 && (
              <p className="mt-1 text-[11px] font-medium text-amber-700 font-mono tabular-nums">
                Por cobrar: {formatUsd(selectedCustomer.balanceUsd)} ·{' '}
                {formatVes(round2(selectedCustomer.balanceUsd * exchangeRate))}
              </p>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleCreateCustomer}
            className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
          >
            <input
              type="text"
              required
              placeholder="Nombre o razón social *"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                placeholder="Cédula / RIF"
                value={newCustomerDoc}
                onChange={(e) => setNewCustomerDoc(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:outline-none"
              />
              <input
                type="tel"
                placeholder="WhatsApp (58412...)"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-[#84CC16] px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer"
            >
              Guardar y asignar
            </button>
          </form>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3.5">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-[190px] flex-col items-center justify-center py-8 text-center">
            <ShoppingCart className="h-8 w-8 text-slate-300" />
            <p className="mt-2.5 text-xs font-semibold text-slate-700">Carrito vacío</p>
            <p className="mt-1 max-w-[210px] text-[11px] text-slate-500">
              Toca productos del catálogo o escanea un código SKU para iniciar.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cart.map((item) => {
              const lineUsd = round2(item.priceUsd * item.quantity);
              const prod = products.find((p) => p.id === item.productId);
              const maxStock = prod ? getBranchStock(prod) : item.quantity;

              return (
                <li key={item.productId} className="py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 font-mono tabular-nums">
                        {formatPrimary(item.priceUsd)} c/u · {item.sku}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      aria-label={`Eliminar ${item.name}`}
                      className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.productId, -1)}
                        aria-label="Disminuir cantidad"
                        className="flex h-7 w-7 items-center justify-center rounded-l-md text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-7 text-center font-mono text-xs font-semibold tabular-nums text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={item.quantity >= maxStock}
                        onClick={() => updateCartQuantity(item.productId, 1)}
                        aria-label="Aumentar cantidad"
                        className="flex h-7 w-7 items-center justify-center rounded-r-md text-slate-700 hover:bg-slate-200/70 disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="text-right font-mono tabular-nums">
                      <p
                        className={`text-xs font-bold ${
                          currency === 'VES' ? 'text-[#558B00]' : 'text-slate-900'
                        }`}
                      >
                        {formatPrimary(lineUsd)}
                      </p>
                      <p
                        className={`text-[11px] ${
                          currency === 'USD' ? 'text-[#558B00] font-medium' : 'text-slate-500'
                        }`}
                      >
                        {formatSecondary(lineUsd)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/80 px-3.5 py-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyTax}
              onChange={(e) => setApplyTax(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-[#76B900]"
            />
            IVA 16% (gravables)
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
          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:outline-none"
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
            <span className="font-sans text-xs font-bold text-slate-900">Total a pagar</span>
            <div className="text-right">
              <p
                className={`text-base font-bold ${
                  currency === 'VES' ? 'text-[#558B00]' : 'text-slate-900'
                }`}
              >
                {formatPrimary(cartTotals.totalUsd)}
              </p>
              <p
                className={`text-xs font-semibold ${
                  currency === 'USD' ? 'text-[#558B00]' : 'text-slate-500'
                }`}
              >
                {formatSecondary(cartTotals.totalUsd)}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={cart.length === 0 || !activeCashier}
          onClick={openCheckoutModal}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-2.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Cobrar {cart.length > 0 ? formatPrimary(cartTotals.totalUsd) : ''}
        </button>
      </div>
    </div>
  );

  if (authChecked && !cloudUser && !offlineAuthBypass) {
    return (
      <CloudAuthScreen
        mode="fullscreen"
        isOnline={isOnline}
        defaultBusinessName={businessSettings.businessName}
        onAuthSuccess={(user, name) => void handleCloudAuthSuccess(user, name)}
        onContinueOffline={handleContinueOffline}
      />
    );
  }

  return (
    <div className="flex h-full min-h-screen flex-col bg-[#F8FAFC] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white text-slate-900">
        <div className="mx-auto flex items-center justify-between gap-2 overflow-x-auto no-scrollbar whitespace-nowrap px-3 py-1.5 lg:px-5">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              Pos <span className="text-[#558B00]">262</span>
            </span>

            <div className="relative flex items-center shrink-0">
              <Building2 className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" />
              <select
                aria-label="Seleccionar sucursal"
                value={activeBranchId}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="max-w-[120px] truncate rounded-md border border-slate-200 bg-slate-50 py-1 pl-6 pr-2 text-xs font-medium text-slate-800 focus:border-[#76B900] focus:bg-white focus:outline-none cursor-pointer"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            <nav
              aria-label="Módulos"
              className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 shrink-0"
            >
              <button
                type="button"
                onClick={() => setActiveTab('pos')}
                className={`rounded px-2 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'pos'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                POS
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('shifts')}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'shifts'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Lock className="h-3 w-3" />
                Turnos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('inventory')}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'inventory'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <ArrowLeftRight className="h-3 w-3" />
                Stock
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'reports'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <BarChart3 className="h-3 w-3" />
                Reportes
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('costing')}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'costing'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Calculator className="h-3 w-3" />
                Costos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Settings className="h-3 w-3" />
                Config
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs focus-within:border-[#76B900] focus-within:bg-white shrink-0">
              <span className="font-medium text-slate-500 whitespace-nowrap">Bs/$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                aria-label="Tasa diaria de cambio en Bolívares por Dólar"
                value={exchangeRateInput}
                onChange={(e) => handleExchangeRateChange(e.target.value)}
                className="w-12 bg-transparent text-right font-mono text-xs font-bold tabular-nums text-[#558B00] focus:outline-none"
              />
            </label>

            <div
              role="group"
              aria-label="Moneda de visualización"
              className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 shrink-0"
            >
              <button
                type="button"
                onClick={() => handleCurrencyChange('USD')}
                className={`rounded px-2 py-0.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  currency === 'USD'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                $
              </button>
              <button
                type="button"
                onClick={() => handleCurrencyChange('VES')}
                className={`rounded px-2 py-0.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  currency === 'VES'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bs
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!cloudUser) {
                  setActiveTab('settings');
                } else {
                  setHistoryTab('queue');
                  setHistoryOpen(true);
                }
              }}
              title={
                cloudUser
                  ? `Cuenta nube: ${cloudUser.email} · Clic para ver cola`
                  : 'Clic para vincular cuenta en la nube en Configuración'
              }
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                cloudSyncState === 'offline'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/70'
                  : cloudSyncState === 'synced'
                  ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212] hover:bg-[#ECFCCB]'
                  : cloudSyncState === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100/70'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {cloudSyncState === 'offline' ? (
                <WifiOff className="h-3.5 w-3.5 text-amber-600" />
              ) : cloudSyncState === 'syncing' ? (
                <RefreshCw className="h-3 w-3 animate-spin text-[#76B900]" />
              ) : cloudSyncState === 'local' ? (
                <CloudOff className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <Cloud
                  className={`h-3.5 w-3.5 ${
                    cloudSyncState === 'error' ? 'text-red-500' : 'text-[#76B900]'
                  }`}
                />
              )}
              <span>
                {cloudSyncState === 'offline'
                  ? 'Modo Offline'
                  : cloudSyncState === 'syncing'
                  ? 'Sincronizando...'
                  : cloudSyncState === 'synced'
                  ? 'Sincronizado'
                  : cloudSyncState === 'local'
                  ? 'Solo local'
                  : cloudSyncState === 'error'
                  ? 'Reintentar sync'
                  : 'Pendiente'}
              </span>
              {pendingSyncSummary.total > 0 && cloudSyncState !== 'syncing' && (
                <span className="font-mono font-bold tabular-nums text-amber-700">
                  · {pendingSyncSummary.total}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setLoginModalOpen(true)}
              title="Cambiar cajero"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="h-3.5 w-3.5 text-[#76B900]" />
              <span className="max-w-[80px] truncate">
                {activeCashier ? activeCashier.name : 'Ingresar'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setHistoryTab('sales');
                setHistoryOpen(true);
              }}
              aria-label="Historial de ventas y sincronización"
              title="Historial de ventas y cola offline"
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0 cursor-pointer"
            >
              <History className="h-3.5 w-3.5" />
            </button>

            {!isInstalled && (deferredPrompt || isIOS) && (
              <button
                type="button"
                onClick={deferredPrompt ? handleInstallPWA : () => setShowIOSInstallGuide(true)}
                className="inline-flex items-center gap-1 rounded-md bg-[#84CC16] px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-[#76B900] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="h-3 w-3" />
                <span>Instalar</span>
              </button>
            )}
          </div>
        </div>
        {syncNotice && (
          <div className="border-t border-[#84CC16]/30 bg-[#F7FEE7] px-3 py-1 text-xs font-medium text-[#3F6212] lg:px-5">
            {syncNotice}
          </div>
        )}
      </header>

      {activeTab === 'pos' && (
        <>
          {!activeShift && activeCashier && (
            <div className="border-b border-amber-200 bg-amber-50/80 px-3 py-1.5 text-xs text-amber-900 lg:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  Sin turno abierto en {activeBranch?.name}. Abre un turno con fondo inicial para llevar el arqueo.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('shifts')}
                  className="font-semibold text-amber-950 underline underline-offset-2 hover:text-amber-700 cursor-pointer whitespace-nowrap"
                >
                  Abrir turno
                </button>
              </div>
            </div>
          )}

          <main className="flex flex-1 overflow-hidden">
            <section className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-slate-200 bg-white px-3.5 py-2.5 lg:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1 max-w-lg">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Buscar por nombre, SKU o código de barras (Enter)..."
                      className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <p className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
                    {filteredProducts.length} productos · {activeBranch?.name ?? 'Sucursal'}
                    {activeShift ? (
                      <span className="text-[#558B00] font-semibold"> · Turno abierto</span>
                    ) : null}
                  </p>
                </div>

                <div className="mt-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {categories.map((category) => {
                    const isActive = selectedCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedCategory(category)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isActive
                            ? 'bg-[#84CC16] text-slate-950'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 pb-20 lg:p-5 lg:pb-5">
                {!isReady ? (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white p-3"
                      />
                    ))}
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white py-12 text-center">
                    <Search className="h-7 w-7 text-slate-300" />
                    <p className="mt-2.5 text-sm font-semibold text-slate-800">
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
                      className="mt-3 rounded-md bg-[#84CC16] px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
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
                          className={`group flex flex-col justify-between rounded-lg border p-3 text-left transition-all cursor-pointer ${
                            outOfStock
                              ? 'border-slate-200 bg-slate-100/70 opacity-60 cursor-not-allowed'
                              : inCartQty > 0
                              ? 'border-[#76B900] bg-[#F7FEE7]/50 ring-1 ring-[#84CC16]/30'
                              : 'border-slate-200 bg-white hover:border-[#76B900]/60'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h2 className="text-xs font-semibold leading-snug text-slate-900 group-hover:text-[#3F6212] transition-colors">
                                {product.name}
                              </h2>
                              {inCartQty > 0 && (
                                <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-[#558B00]">
                                  ×{inCartQty}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
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

                          <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-100 pt-2">
                            <div className="font-mono tabular-nums">
                              <p
                                className={`text-sm font-bold ${
                                  currency === 'VES' ? 'text-[#558B00]' : 'text-slate-900'
                                }`}
                              >
                                {formatPrimary(product.priceUsd)}
                              </p>
                              <p
                                className={`text-[11px] ${
                                  currency === 'USD' ? 'text-[#558B00] font-medium' : 'text-slate-500'
                                }`}
                              >
                                {formatSecondary(product.priceUsd)}
                              </p>
                            </div>

                            <div className="text-right text-[11px] font-semibold tabular-nums">
                              {outOfStock ? (
                                <span className="text-red-600">Agotado</span>
                              ) : lowStock ? (
                                <span className="text-amber-700">Bajo: {stock}</span>
                              ) : (
                                <span className="text-slate-500">Stock: {stock}</span>
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

            <aside className="hidden w-[350px] shrink-0 border-l border-slate-200 lg:block xl:w-[380px]">
              {renderCartContent()}
            </aside>
          </main>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-3 py-2 lg:hidden">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMobileCartOpen(true)}
                className="flex flex-1 items-center justify-between rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                <span className="inline-flex items-center gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5" />
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
                  className="rounded-lg bg-[#84CC16] px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Cobrar
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'shifts' && activeCashier && activeBranch && (
        <div className="flex-1 overflow-y-auto">
          <ShiftManager
            activeCashier={activeCashier}
            activeBranch={activeBranch}
            branches={branches}
            activeShift={activeShift}
            shifts={shifts}
            sales={sales}
            onOpenShift={handleOpenShift}
            onCloseShift={handleCloseShift}
            onSwitchCashier={() => setLoginModalOpen(true)}
          />
        </div>
      )}

      {activeTab === 'inventory' && activeCashier && (
        <div className="flex-1 overflow-y-auto">
          <InventoryManager
            branches={branches}
            activeBranchId={activeBranchId}
            products={products}
            transfers={transfers}
            activeCashier={activeCashier}
            onLoadStock={handleLoadStock}
            onTransferStock={handleTransferStock}
          />
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="flex-1 overflow-y-auto">
          <ReportsManager
            sales={sales}
            products={products}
            branches={branches}
            currency={currency}
            exchangeRate={exchangeRate}
            onSettleReceivable={handleSettleReceivable}
          />
        </div>
      )}

      {activeTab === 'costing' && activeCashier && (
        <div className="flex-1 overflow-y-auto">
          <CostingManager
            products={products}
            branches={branches}
            activeBranchId={activeBranchId}
            activeCashier={activeCashier}
            supplierQuotes={supplierQuotes}
            expenses={expenses}
            sales={sales}
            currency={currency}
            exchangeRate={exchangeRate}
            onUpdateProductPricing={handleUpdateProductPricing}
            onAddSupplierQuote={handleAddSupplierQuote}
            onDeleteSupplierQuote={handleDeleteSupplierQuote}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
          />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="flex-1 overflow-y-auto">
          <SettingsManager
            cloudUser={cloudUser}
            isOnline={isOnline}
            isSyncing={isSyncing}
            cloudSyncState={cloudSyncState}
            lastSyncedAt={lastSyncedAt}
            lastSyncError={lastSyncError}
            pendingSyncSummary={pendingSyncSummary}
            businessSettings={businessSettings}
            counts={{
              products: products.length,
              customers: customers.length,
              sales: sales.length,
              shifts: shifts.length,
              transfers: transfers.length,
              quotes: supplierQuotes.length,
              expenses: expenses.length,
            }}
            onSaveBusinessSettings={handleSaveBusinessSettings}
            onManualSync={async () => {
              await triggerSyncQueue('manual');
            }}
            onOpenCloudAuth={() => setCloudAuthModalOpen(true)}
            onSignOutCloud={handleSignOutCloud}
            onOpenSyncQueue={() => {
              setHistoryTab('queue');
              setHistoryOpen(true);
            }}
          />
        </div>
      )}

      {cloudAuthModalOpen && (
        <CloudAuthScreen
          mode="modal"
          isOnline={isOnline}
          defaultBusinessName={businessSettings.businessName}
          onAuthSuccess={(user, name) => void handleCloudAuthSuccess(user, name)}
          onContinueOffline={handleContinueOffline}
          onClose={() => setCloudAuthModalOpen(false)}
        />
      )}

      {loginModalOpen && !cloudAuthModalOpen && cashiers.length > 0 && (
        <CashierLoginModal
          cashiers={cashiers}
          branches={branches}
          activeCashier={activeCashier}
          onLogin={handleCashierLogin}
          onClose={activeCashier ? () => setLoginModalOpen(false) : undefined}
        />
      )}

      {mobileCartOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/50 lg:hidden">
          <div className="flex h-full w-full max-w-md flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5">
              <h2 className="text-sm font-bold text-slate-900">
                Carrito ({cartTotals.itemCount})
              </h2>
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                aria-label="Cerrar carrito"
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{renderCartContent()}</div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
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
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {completedSale ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#76B900]" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Recibo {completedSale.receiptNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {completedSale.saleType === 'cash' ? 'Venta de Contado' : 'Venta a Crédito'}
                        <span aria-hidden="true"> · </span>
                        <span
                          className={
                            completedSale.syncStatus === 'synced'
                              ? 'font-semibold text-[#558B00]'
                              : 'font-semibold text-amber-700'
                          }
                        >
                          {completedSale.syncStatus === 'synced'
                            ? 'Sincronizada'
                            : 'Guardada offline (pendiente)'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="text-base font-bold text-slate-900">
                      {formatUsd(completedSale.totalUsd)}
                    </p>
                    <p className="text-xs font-semibold text-[#558B00]">
                      {formatVes(completedSale.totalVes)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-mono text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {buildWhatsAppReceiptText(completedSale, businessSettings)}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <a
                    href={buildWhatsAppUrl(completedSale, businessSettings)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors sm:col-span-2"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Enviar recibo por WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyReceipt(completedSale)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {copiedReceiptId === completedSale.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#76B900]" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
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
                  className="w-full rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Nueva venta
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono tabular-nums">
                  <div>
                    <p className="font-sans text-[11px] font-medium text-slate-500">Total en Dólares</p>
                    <p className="mt-0.5 text-lg font-bold text-slate-900">
                      {formatUsd(cartTotals.totalUsd)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-sans text-[11px] font-medium text-slate-500">
                      Total en Bolívares (Tasa {exchangeRate.toFixed(2)})
                    </p>
                    <p className="mt-0.5 text-lg font-bold text-[#558B00]">
                      {formatVes(cartTotals.totalVes)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSaleType('cash');
                      setCheckoutError('');
                    }}
                    className={`rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      saleType === 'cash'
                        ? 'bg-[#84CC16] text-slate-950'
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
                    className={`rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      saleType === 'credit'
                        ? 'bg-[#84CC16] text-slate-950'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Crédito
                  </button>
                </div>

                {saleType === 'credit' && (
                  <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3 sm:grid-cols-2">
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
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
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
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-slate-600">
                    Método de pago {saleType === 'credit' ? '(opcional abono inicial)' : ''}
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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
                          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-left text-xs font-semibold transition-colors cursor-pointer ${
                            active
                              ? 'border-[#76B900] bg-[#F7FEE7] text-slate-950'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#558B00]' : 'text-slate-400'}`} />
                          <span className="truncate">{pm.method}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
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
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-xs font-medium text-slate-600">
                      Referencia {activeMethodConfig.requiresRef ? '(últimos 4-6)' : '(opcional)'}
                    </label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Ej: 482910"
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end sm:col-span-3">
                    <button
                      type="button"
                      onClick={handleAddPaymentLine}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>

                {payments.length > 0 && (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {payments.map((payment, index) => (
                      <div
                        key={`${payment.method}-${index}`}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">{payment.method}</span>
                          {payment.reference && (
                            <span className="ml-2 font-mono text-slate-500">
                              Ref: {payment.reference}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 font-mono tabular-nums">
                          <span className="font-semibold text-slate-900">
                            {formatUsd(payment.amountUsd)}{' '}
                            <span className="text-[#558B00]">({formatVes(payment.amountVes)})</span>
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

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5 text-xs font-mono tabular-nums">
                  <div>
                    <span className="font-sans text-slate-500">Registrado: </span>
                    <span className="font-bold text-slate-900">{formatUsd(paidTotalUsd)}</span>
                  </div>
                  {remainingUsd > 0 ? (
                    <div className="font-bold text-amber-700">
                      <span className="font-sans font-medium">
                        {saleType === 'credit' ? 'Queda a crédito: ' : 'Faltante: '}
                      </span>
                      {formatUsd(remainingUsd)} ({formatVes(round2(remainingUsd * exchangeRate))})
                    </div>
                  ) : (
                    <div className="font-bold text-[#558B00]">
                      <span className="font-sans font-medium">Vuelto: </span>
                      {formatUsd(changeUsd)} ({formatVes(round2(changeUsd * exchangeRate))})
                    </div>
                  )}
                </div>

                {checkoutError && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {checkoutError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(false)}
                    className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmSale()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {saleType === 'credit' ? 'Registrar crédito' : 'Confirmar venta'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Cola de sincronización offline e historial
                </h2>
                <p className="text-xs text-slate-500">
                  Estado: <strong>{isOnline ? 'En línea' : 'Offline'}</strong> · Pendientes:{' '}
                  <strong className="font-mono tabular-nums">{pendingSyncSummary.total}</strong> ({pendingSyncSummary.pendingSales} ventas,{' '}
                  {pendingSyncSummary.pendingShifts} turnos, {pendingSyncSummary.pendingTransfers} stock,{' '}
                  {pendingSyncSummary.pendingExpenses} gastos
                  {pendingSyncSummary.pendingOther > 0 ? `, ${pendingSyncSummary.pendingOther} otros` : ''})
                  {lastSyncedAt
                    ? ` · Última sync: ${new Date(lastSyncedAt).toLocaleString('es-VE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!isOnline || isSyncing}
                  onClick={() => void triggerSyncQueue('manual')}
                  className="inline-flex items-center gap-1 rounded-md bg-[#84CC16] px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Cerrar historial"
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2">
              <button
                type="button"
                onClick={() => setHistoryTab('queue')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  historyTab === 'queue'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                Cola offline ({pendingSyncSummary.total} pendientes / {syncQueue.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('sales')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  historyTab === 'sales'
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                Historial de ventas ({sales.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {historyTab === 'queue' ? (
                syncQueue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <CheckCircle2 className="h-7 w-7 text-[#76B900]" />
                    <p className="mt-2.5 text-sm font-semibold text-slate-700">
                      Cola de sincronización al día
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Cada venta, turno, carga/traslado de stock o gasto se guarda primero en IndexedDB con marca de tiempo y se sincroniza automáticamente al volver la conexión.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {syncQueue.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900">
                            [{formatSyncEntityLabel(item.entityType)}] {item.summary}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                            Creado:{' '}
                            {new Date(item.timestamp).toLocaleString('es-VE', {
                              dateStyle: 'short',
                              timeStyle: 'medium',
                            })}
                            {item.syncedAt
                              ? ` · Sincronizado: ${new Date(item.syncedAt).toLocaleString(
                                  'es-VE',
                                  {
                                    dateStyle: 'short',
                                    timeStyle: 'medium',
                                  }
                                )}`
                              : ''}
                          </p>
                        </div>

                        <span
                          className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                            item.syncStatus === 'synced' ? 'text-[#558B00]' : 'text-amber-700'
                          }`}
                        >
                          {item.syncStatus === 'synced' ? 'Sincronizado' : 'Pendiente offline'}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : sales.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Clock className="h-7 w-7 text-slate-300" />
                  <p className="mt-2.5 text-sm font-semibold text-slate-700">
                    Aún no hay ventas registradas
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    La tasa activa ({exchangeRate.toFixed(2)} Bs/$) y todos los registros se guardan en IndexedDB para trabajar offline.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-900">
                          <span className="font-mono">{sale.receiptNumber}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="truncate">{sale.customerName}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {sale.branchName} · {sale.cashierName} ·{' '}
                          {sale.saleType === 'cash' ? 'Contado' : 'Crédito'} ·{' '}
                          {new Date(sale.createdAt).toLocaleString('es-VE', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                          {' · '}
                          <span
                            className={
                              sale.syncStatus === 'synced'
                                ? 'font-semibold text-[#558B00]'
                                : 'font-semibold text-amber-700'
                            }
                          >
                            {sale.syncStatus === 'synced' ? 'Sincronizada' : 'Pendiente offline'}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2.5 sm:justify-end">
                        <div className="text-left sm:text-right font-mono tabular-nums">
                          <p className="text-xs font-bold text-slate-900">
                            {formatUsd(sale.totalUsd)}
                          </p>
                          <p className="text-[11px] font-medium text-[#558B00]">
                            {formatVes(sale.totalVes)}
                          </p>
                        </div>
                        <a
                          href={buildWhatsAppUrl(sale, businessSettings)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-[#84CC16]/60 bg-[#F7FEE7] px-2.5 py-1 text-xs font-semibold text-[#3F6212] hover:bg-[#ECFCCB] whitespace-nowrap shrink-0"
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

      {showIOSInstallGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900">Instalar Pos 262 en iOS</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              1. Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.
              <br />
              2. Desliza y selecciona <strong>Agregar a pantalla de inicio</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSInstallGuide(false)}
              className="mt-3.5 w-full rounded-lg bg-[#84CC16] py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
