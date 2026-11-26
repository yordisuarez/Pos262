import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Link2,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { DEFAULT_BUSINESS_SETTINGS, db, getLocalBusinessSettings } from '../db/posDb';
import { getSafeSession, isSupabaseConfigured, supabase } from '../lib/supabase';
import type { BusinessSettings, PaymentMethod, Product } from '../types/pos';
import { triggerFlyToCart } from '../utils/flyToCart';
import {
  formatQuantity,
  getQuantityStep,
  isWeightOrVolumeUnit,
  roundQty,
} from '../utils/quantityUnits';
import { ProductImageBox } from './ProductImageBox';
import { CartDecimalQtyInput, WeightQuantityModal } from './WeightQuantityModal';

interface WebCatalogViewProps {
  mode: 'public' | 'embedded';
  initialProducts?: Product[];
  initialBusinessSettings?: BusinessSettings;
  initialExchangeRate?: number;
  activeBranchId?: string;
  storeUserId?: string;
  onExit?: () => void;
}

interface CatalogCartItem {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  priceUsd: number;
  quantity: number;
  maxStock: number;
  imageUrl?: string;
}

const CATALOG_PAYMENT_METHODS: PaymentMethod[] = [
  'Efectivo Bs',
  'Pago Móvil',
  'Biopago',
  'Punto de Venta',
  'Efectivo Divisa $',
  'Binance USDT',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE_STORAGE_KEY = 'pos_262_exchange_rate';

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

function normalizeWhatsAppPhone(rawPhone?: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  // Normalize Venezuelan local format (e.g., 04121234567 -> 584121234567)
  if (digits.length === 11 && (digits.startsWith('04') || digits.startsWith('02'))) {
    return `58${digits.slice(1)}`;
  }
  if (digits.length >= 7 && digits.length <= 15) {
    return digits;
  }
  return '';
}

function getStoreParamFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const store = new URLSearchParams(window.location.search).get('store')?.trim() || '';
  return UUID_REGEX.test(store) ? store : null;
}

function parseCloudProduct(recordId: string, payload: unknown): Product | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;

  const stockMap: Record<string, number> = {};
  if (raw.stockByBranch && typeof raw.stockByBranch === 'object' && !Array.isArray(raw.stockByBranch)) {
    for (const [branchId, qty] of Object.entries(raw.stockByBranch as Record<string, unknown>)) {
      const parsed = Number(qty);
      if (Number.isFinite(parsed)) {
        stockMap[branchId] = Math.max(0, parsed);
      }
    }
  }

  const priceUsd = Number(raw.priceUsd);
  const costUsd = Number(raw.costUsd);
  const minStock = Number(raw.minStock);

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : recordId,
    sku: typeof raw.sku === 'string' ? raw.sku : '',
    barcode: typeof raw.barcode === 'string' ? raw.barcode : undefined,
    name,
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'General',
    priceUsd: Number.isFinite(priceUsd) && priceUsd >= 0 ? priceUsd : 0,
    costUsd: Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : 0,
    taxExempt: Boolean(raw.taxExempt),
    unit: typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : 'und',
    minStock: Number.isFinite(minStock) && minStock >= 0 ? minStock : 0,
    stockByBranch: stockMap,
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined,
    image_url: typeof raw.image_url === 'string' ? raw.image_url : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    syncStatus: 'synced',
  };
}

export function hasCatalogUrlParam(): boolean {
  if (typeof window === 'undefined') return false;
  const val = new URLSearchParams(window.location.search).get('catalog');
  return val === '1' || val === 'true';
}

export const WebCatalogView: React.FC<WebCatalogViewProps> = ({
  mode,
  initialProducts,
  initialBusinessSettings,
  initialExchangeRate,
  activeBranchId,
  storeUserId,
  onExit,
}) => {
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(
    initialBusinessSettings ?? DEFAULT_BUSINESS_SETTINGS
  );
  const [exchangeRate, setExchangeRate] = useState<number>(() => {
    if (initialExchangeRate && initialExchangeRate > 0) return initialExchangeRate;
    try {
      const saved = Number(localStorage.getItem(RATE_STORAGE_KEY));
      if (Number.isFinite(saved) && saved > 0) return saved;
    } catch {
      // Ignore storage access errors
    }
    return DEFAULT_BUSINESS_SETTINGS.exchangeRate;
  });
  const [resolvedBranchId, setResolvedBranchId] = useState<string>(activeBranchId ?? '');
  const [loading, setLoading] = useState<boolean>(mode === 'public' && (!initialProducts || initialProducts.length === 0));

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [cart, setCart] = useState<CatalogCartItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);
  const [weightPrompt, setWeightPrompt] = useState<{
    product: Product;
    sourceEl: HTMLElement | null;
  } | null>(null);

  // Customer WhatsApp checkout form fields
  const [customerName, setCustomerName] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pago Móvil');
  const [orderNote, setOrderNote] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [copiedTicket, setCopiedTicket] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const desktopCartTargetRef = useRef<HTMLDivElement | null>(null);
  const mobileCartBarRef = useRef<HTMLButtonElement | null>(null);

  // Sync live props when embedded inside Pos 262
  useEffect(() => {
    if (mode !== 'embedded') return;
    if (initialProducts) setProducts(initialProducts);
    if (initialBusinessSettings) setBusinessSettings(initialBusinessSettings);
    if (initialExchangeRate && initialExchangeRate > 0) setExchangeRate(initialExchangeRate);
    if (activeBranchId !== undefined) setResolvedBranchId(activeBranchId);
    setLoading(false);
  }, [mode, initialProducts, initialBusinessSettings, initialExchangeRate, activeBranchId]);

  // Auto-close phone-only Bottom Sheet if viewport expands to md+
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(min-width: 768px)');
    const handleViewport = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setSheetOpen(false);
    };
    handleViewport(mql);
    mql.addEventListener('change', handleViewport);
    return () => mql.removeEventListener('change', handleViewport);
  }, []);

  // Load local IndexedDB cache + Supabase store catalog when opened via ?catalog=1
  useEffect(() => {
    if (mode !== 'public') return;

    let cancelled = false;

    const loadPublicCatalog = async () => {
      // 1. Hydrate fast from local IndexedDB cache if present on device
      try {
        const [localProducts, localSettings, localBranchSetting] = await Promise.all([
          db.products.toArray(),
          getLocalBusinessSettings(),
          db.settings.get('activeBranchId'),
        ]);

        if (!cancelled) {
          if (localProducts.length > 0) {
            setProducts(localProducts);
          }
          if (localSettings) {
            setBusinessSettings(localSettings);
            if (Number.isFinite(localSettings.exchangeRate) && localSettings.exchangeRate > 0) {
              setExchangeRate(localSettings.exchangeRate);
            }
          }
          if (localBranchSetting?.value) {
            setResolvedBranchId(localBranchSetting.value);
          }
          if (localProducts.length > 0) {
            setLoading(false);
          }
        }
      } catch {
        // IndexedDB may be empty or restricted in private browsing
      }

      // 2. Refresh from Supabase if online and configured
      if (!isSupabaseConfigured || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        let targetUserId = getStoreParamFromUrl();
        if (!targetUserId) {
          const { session } = await getSafeSession();
          targetUserId = session?.user?.id ?? null;
        }

        const settingsQuery = supabase
          .from('business_settings')
          .select('user_id, business_name, rif, phone, address, exchange_rate, updated_at');

        const { data: settingsRow } = targetUserId
          ? await settingsQuery.eq('user_id', targetUserId).maybeSingle()
          : await settingsQuery.order('updated_at', { ascending: false }).limit(1).maybeSingle();

        const effectiveUserId =
          targetUserId ||
          (settingsRow && typeof (settingsRow as { user_id?: unknown }).user_id === 'string'
            ? (settingsRow as { user_id: string }).user_id
            : null);

        if (!cancelled && settingsRow) {
          const row = settingsRow as {
            business_name?: string;
            rif?: string;
            phone?: string;
            address?: string;
            exchange_rate?: number;
            updated_at?: string;
          };
          const parsedRate = Number(row.exchange_rate);
          const validRate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null;
          setBusinessSettings((prev) => ({
            ...prev,
            businessName: row.business_name || prev.businessName,
            rif: row.rif ?? prev.rif,
            phone: row.phone ?? prev.phone,
            address: row.address ?? prev.address,
            exchangeRate: validRate ?? prev.exchangeRate,
            updatedAt: row.updated_at || prev.updatedAt,
          }));
          if (validRate) {
            setExchangeRate(validRate);
          }
        }

        let productsQuery = supabase
          .from('sync_records')
          .select('record_id, payload, deleted, updated_at')
          .eq('entity_type', 'product')
          .eq('deleted', false)
          .limit(1000);

        if (effectiveUserId) {
          productsQuery = productsQuery.eq('user_id', effectiveUserId);
        }

        const { data: productRows } = await productsQuery;
        if (!cancelled && Array.isArray(productRows) && productRows.length > 0) {
          const parsedProducts = productRows
            .map((row) =>
              parseCloudProduct(
                String((row as { record_id?: unknown }).record_id ?? ''),
                (row as { payload?: unknown }).payload
              )
            )
            .filter((item): item is Product => item !== null);

          if (parsedProducts.length > 0) {
            setProducts(parsedProducts);
          }
        }
      } catch {
        // Keep local cached catalog if cloud fetch is unavailable
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPublicCatalog();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const getProductStock = useCallback(
    (product: Product): number => {
      if (
        resolvedBranchId &&
        Object.prototype.hasOwnProperty.call(product.stockByBranch, resolvedBranchId)
      ) {
        return Math.max(0, Number(product.stockByBranch[resolvedBranchId]) || 0);
      }
      return Object.values(product.stockByBranch).reduce(
        (sum, qty) => sum + Math.max(0, Number(qty) || 0),
        0
      );
    },
    [resolvedBranchId]
  );

  // Show available products (stock > 0); if catalog has zero stocked items, show full list cleanly
  const catalogProducts = useMemo(() => {
    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const inStock = sorted.filter((p) => getProductStock(p) > 0);
    return inStock.length > 0 ? inStock : sorted;
  }, [products, getProductStock]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    catalogProducts.forEach((p) => {
      if (p.category?.trim()) unique.add(p.category.trim());
    });
    return ['Todos', ...Array.from(unique).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [catalogProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalogProducts.filter((product) => {
      const cat = product.category?.trim() || 'General';
      if (selectedCategory !== 'Todos' && cat !== selectedCategory) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        (product.barcode && product.barcode.toLowerCase().includes(q))
      );
    });
  }, [catalogProducts, searchQuery, selectedCategory]);

  const cartSummary = useMemo(() => {
    const itemCount = roundQty(cart.reduce((sum, item) => sum + item.quantity, 0));
    const totalUsd = round2(cart.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0));
    const totalVes = round2(totalUsd * exchangeRate);
    return { itemCount, totalUsd, totalVes };
  }, [cart, exchangeRate]);

  const getCartQty = (productId: string): number =>
    cart.find((item) => item.productId === productId)?.quantity ?? 0;

  const fireFlyAnimation = (product: Product, sourceEl: HTMLElement | null) => {
    if (!sourceEl) return;
    const desktopEl = desktopCartTargetRef.current;
    const desktopRect = desktopEl?.getBoundingClientRect();
    const isDesktopVisible = Boolean(desktopEl && desktopRect && desktopRect.width > 0 && desktopRect.height > 0);

    if (isDesktopVisible) {
      triggerFlyToCart({
        sourceEl,
        targetEl: desktopEl,
        imageUrl: product.imageUrl || product.image_url,
        productName: product.name,
        showPhoto: true,
      });
      return;
    }

    const mobileEl = mobileCartBarRef.current;
    if (mobileEl) {
      triggerFlyToCart({
        sourceEl,
        targetEl: mobileEl,
        imageUrl: product.imageUrl || product.image_url,
        productName: product.name,
        showPhoto: true,
      });
      return;
    }

    // On phones, the bottom cart bar mounts when adding the 1st item; fire flight on next frame
    window.requestAnimationFrame(() => {
      triggerFlyToCart({
        sourceEl,
        targetEl: mobileCartBarRef.current,
        imageUrl: product.imageUrl || product.image_url,
        productName: product.name,
        showPhoto: true,
      });
    });
  };

  const handleAddProduct = (
    product: Product,
    sourceEl: HTMLElement | null,
    quantityToAdd = 1
  ) => {
    const stock = roundQty(getProductStock(product));
    const maxStock = stock > 0 ? stock : 999;
    const safeAdd = roundQty(quantityToAdd);
    if (safeAdd <= 0) return;

    const existingQty = getCartQty(product.id);
    if (existingQty >= maxStock - 0.0001) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= maxStock - 0.0001) return prev;
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: Math.min(maxStock, roundQty(item.quantity + safeAdd)), maxStock }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unit: product.unit || 'und',
          priceUsd: product.priceUsd,
          quantity: Math.min(maxStock, safeAdd),
          maxStock,
          imageUrl: product.imageUrl || product.image_url,
        },
      ];
    });

    setFormError('');
    fireFlyAnimation(product, sourceEl);
  };

  const handleSelectProduct = (product: Product, sourceEl: HTMLElement | null) => {
    const stock = roundQty(getProductStock(product));
    const maxStock = stock > 0 ? stock : 999;
    if (getCartQty(product.id) >= maxStock - 0.0001) return;

    if (isWeightOrVolumeUnit(product.unit)) {
      setWeightPrompt({ product, sourceEl });
      return;
    }

    handleAddProduct(product, sourceEl, 1);
  };

  const handleConfirmWeightPrompt = (quantity: number) => {
    if (!weightPrompt) return;
    const { product, sourceEl } = weightPrompt;
    setWeightPrompt(null);
    handleAddProduct(product, sourceEl, quantity);
  };

  const updateItemQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const nextQty = Math.min(item.maxStock, roundQty(item.quantity + delta));
          return { ...item, quantity: nextQty };
        })
        .filter((item) => item.quantity > 0.0001)
    );
  };

  const setItemQty = (productId: string, nextQuantity: number) => {
    const rounded = roundQty(nextQuantity);
    if (rounded <= 0.0001) {
      setCart((prev) => prev.filter((item) => item.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(item.maxStock, rounded) }
          : item
      )
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const storeWhatsAppPhone = useMemo(
    () => normalizeWhatsAppPhone(businessSettings.phone),
    [businessSettings.phone]
  );

  const buildOrderTicketText = useCallback((): string => {
    const storeName = businessSettings.businessName?.trim() || 'Pos 262';
    const lines: string[] = [
      `*PEDIDO WEB — ${storeName}*`,
      '────────────────────────',
      `*Cliente:* ${customerName.trim()}`,
      `*Dirección / Ref.:* ${customerAddress.trim()}`,
      `*Método de pago:* ${paymentMethod}`,
    ];

    if (orderNote.trim()) {
      lines.push(`*Nota:* ${orderNote.trim()}`);
    }

    lines.push('────────────────────────');
    lines.push('*Detalle del pedido:*');

    cart.forEach((item) => {
      const subUsd = round2(item.priceUsd * item.quantity);
      const subVes = round2(subUsd * exchangeRate);
      const qtyLabel = isWeightOrVolumeUnit(item.unit)
        ? `${formatQuantity(item.quantity)} ${item.unit} x ${item.name}`
        : `${formatQuantity(item.quantity)}x ${item.name} (${item.unit})`;
      lines.push(`• ${qtyLabel} — ${formatVes(subVes)} (${formatUsd(subUsd)})`);
    });

    lines.push('────────────────────────');
    lines.push(`*Artículos:* ${formatQuantity(cartSummary.itemCount)}`);
    lines.push(`*Tasa referencial:* Bs ${exchangeRate.toFixed(2)}/$`);
    lines.push(`*TOTAL REFERENCIAL:*`);
    lines.push(`*${formatVes(cartSummary.totalVes)}* / *${formatUsd(cartSummary.totalUsd)} USD*`);

    return lines.join('\n');
  }, [
    businessSettings.businessName,
    customerName,
    customerAddress,
    paymentMethod,
    orderNote,
    cart,
    exchangeRate,
    cartSummary,
  ]);

  const validateCheckoutForm = (): boolean => {
    if (cart.length === 0) {
      setFormError('Agrega al menos un producto al pedido.');
      return false;
    }
    if (!customerName.trim()) {
      setFormError('Ingresa tu nombre para enviar el pedido.');
      return false;
    }
    if (!customerAddress.trim()) {
      setFormError('Ingresa tu dirección o punto de referencia.');
      return false;
    }
    setFormError('');
    return true;
  };

  const handleSendWhatsApp = () => {
    if (!validateCheckoutForm()) return;
    if (!storeWhatsAppPhone) {
      setFormError(
        'El comercio aún no ha configurado su número de WhatsApp en Ajustes. Usa "Copiar pedido" para enviarlo manualmente.'
      );
      return;
    }

    const ticket = buildOrderTicketText();
    const url = `https://wa.me/${storeWhatsAppPhone}?text=${encodeURIComponent(ticket)}`;

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleCopyTicket = async () => {
    if (!validateCheckoutForm()) return;
    try {
      await navigator.clipboard.writeText(buildOrderTicketText());
      setCopiedTicket(true);
      window.setTimeout(() => setCopiedTicket(false), 2200);
    } catch {
      setFormError('No se pudo copiar el ticket automáticamente en este navegador.');
    }
  };

  const handleCopyCatalogLink = async () => {
    if (typeof window === 'undefined') return;
    const base = `${window.location.origin}${window.location.pathname}`;
    const query = storeUserId ? `?catalog=1&store=${encodeURIComponent(storeUserId)}` : '?catalog=1';
    try {
      await navigator.clipboard.writeText(`${base}${query}`);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const renderOrderContent = (isDesktopPanel: boolean) => (
    <div
      className={`flex min-h-0 flex-col bg-white ${
        isDesktopPanel ? 'h-full' : 'flex-auto overflow-hidden'
      }`}
    >
      {/* Customer Info Section (always shrink-0) */}
      <div
        className={`shrink-0 border-b border-slate-200 bg-slate-50/70 ${
          isDesktopPanel ? 'p-3.5 space-y-2' : 'px-4 py-2.5 space-y-2'
        }`}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
          <div>
            <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">
              Nombre *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="Tu nombre completo"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">
              Método de pago preferido
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:outline-none"
            >
              {CATALOG_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
          <div>
            <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">
              Dirección / Punto de referencia *
            </label>
            <input
              type="text"
              value={customerAddress}
              onChange={(e) => {
                setCustomerAddress(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="Sector, calle o punto de referencia"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Ej. Sin bolsa, llamar al llegar..."
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ONLY Cart Items List Scrolls */}
      <div
        className={`min-h-[88px] overflow-y-auto overscroll-contain ${
          isDesktopPanel ? 'flex-1 px-3.5 py-2' : 'flex-auto px-4 py-2'
        }`}
      >
        {cart.length === 0 ? (
          <div className="flex h-full min-h-[150px] flex-col items-center justify-center py-8 text-center">
            <ShoppingBag className="h-8 w-8 text-slate-300" />
            <p className="mt-2.5 text-xs font-semibold text-slate-700">Tu pedido está vacío</p>
            <p className="mt-1 max-w-[210px] text-[11px] text-slate-500">
              Agrega productos del catálogo para armar tu pedido y enviarlo por WhatsApp.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cart.map((item) => {
              const lineUsd = round2(item.priceUsd * item.quantity);
              const lineVes = round2(lineUsd * exchangeRate);
              const isFractional = isWeightOrVolumeUnit(item.unit);
              const qtyStep = getQuantityStep(item.unit);

              return (
                <li key={item.productId} className="py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-900">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                        {formatVes(round2(item.priceUsd * exchangeRate))} · {formatUsd(item.priceUsd)}/{item.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      aria-label={`Quitar ${item.name}`}
                      className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5">
                      <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => updateItemQty(item.productId, -qtyStep)}
                          aria-label="Disminuir cantidad"
                          className="flex h-7 w-7 items-center justify-center rounded-l-md text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        {isFractional ? (
                          <CartDecimalQtyInput
                            quantity={item.quantity}
                            maxStock={item.maxStock}
                            unitLabel={item.unit}
                            onCommit={(nextQty) => setItemQty(item.productId, nextQty)}
                          />
                        ) : (
                          <span className="w-8 text-center text-xs font-semibold tabular-nums text-slate-900">
                            {formatQuantity(item.quantity)}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={item.quantity >= item.maxStock - 0.0001}
                          onClick={() => updateItemQty(item.productId, qtyStep)}
                          aria-label="Aumentar cantidad"
                          className="flex h-7 w-7 items-center justify-center rounded-r-md text-slate-700 hover:bg-slate-200/70 disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      {isFractional && (
                        <span className="text-[11px] font-medium text-slate-500">
                          {item.unit}
                        </span>
                      )}
                    </div>

                    <div className="text-right tabular-nums">
                      <p className="text-xs font-bold text-slate-900">{formatVes(lineVes)}</p>
                      <p className="text-[11px] font-medium text-[#558B00]">{formatUsd(lineUsd)}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Pinned Bottom Totals + WhatsApp Action */}
      <div
        className={`shrink-0 border-t border-slate-200 bg-white space-y-2.5 ${
          isDesktopPanel
            ? 'px-3.5 py-3'
            : 'px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]'
        }`}
      >
        {!storeWhatsAppPhone && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>
              WhatsApp del comercio no configurado aún en Ajustes. Puedes copiar el ticket del pedido.
            </span>
          </div>
        )}

        {formError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] font-medium text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
            <span>{formError}</span>
          </div>
        )}

        <div
          ref={isDesktopPanel ? desktopCartTargetRef : undefined}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 tabular-nums transition-shadow"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Total referencial ({formatQuantity(cartSummary.itemCount)})</span>
            <span className="font-mono">Tasa Bs {exchangeRate.toFixed(2)}/$</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-lg font-extrabold tracking-tight text-slate-950">
              {formatVes(cartSummary.totalVes)}
            </p>
            <p className="font-mono text-sm font-bold text-[#3F6212]">
              {formatUsd(cartSummary.totalUsd)} USD
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={handleSendWhatsApp}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-2.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            <MessageCircle className="h-4 w-4 shrink-0" />
            Enviar pedido por WhatsApp
          </button>

          <button
            type="button"
            disabled={cart.length === 0}
            onClick={() => void handleCopyTicket()}
            title="Copiar resumen del pedido"
            aria-label="Copiar resumen del pedido"
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#76B900] hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            {copiedTicket ? (
              <Check className="h-4 w-4 text-[#558B00]" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`flex flex-col bg-slate-50 text-slate-900 ${
        mode === 'public' ? 'h-screen w-full overflow-hidden supports-[height:100dvh]:h-dvh' : 'h-full min-h-0 flex-1 overflow-hidden'
      }`}
    >
      {/* Storefront Header */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#84CC16]/50 bg-[#F7FEE7] text-[#558B00]">
              <Store className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 sm:text-base">
                {businessSettings.businessName || 'Catálogo Web'}
              </h1>
              <p className="truncate text-xs text-slate-500">
                Catálogo Web · Tasa ref.{' '}
                <span className="font-mono font-semibold tabular-nums text-slate-700">
                  Bs {exchangeRate.toFixed(2)}/$
                </span>
                {businessSettings.address ? (
                  <span className="hidden sm:inline">
                    {' '}
                    · <MapPin className="inline h-3 w-3 align-[-2px] text-slate-400" />{' '}
                    {businessSettings.address}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          {mode === 'embedded' && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyCatalogLink()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#76B900] hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#558B00]" />
                    Enlace copiado
                  </>
                ) : (
                  <>
                    <Link2 className="h-3.5 w-3.5 text-[#558B00]" />
                    Copiar enlace
                  </>
                )}
              </button>

              {onExit && (
                <button
                  type="button"
                  onClick={onExit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#76B900] hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Volver al POS
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content Split: Catalog + Desktop/Tablet Side Cart */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Search + Horizontal Category Filters */}
          <div className="shrink-0 space-y-2.5 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto por nombre, categoría o código..."
                aria-label="Buscar producto en el catálogo"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {categories.map((category) => {
                const active = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#84CC16] text-slate-950'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-[#76B900] hover:text-slate-900'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Product Grid */}
          <div
            className={`min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-5 ${
              cart.length > 0 ? 'pb-24 md:pb-5' : 'pb-6'
            }`}
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <RefreshCw className="h-6 w-6 animate-spin text-[#76B900]" />
                <p className="mt-3 text-sm font-medium text-slate-600">Cargando catálogo...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
                <Search className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  No se encontraron productos
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Prueba con otro término de búsqueda o selecciona otra categoría.
                </p>
                {(searchQuery || selectedCategory !== 'Todos') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('Todos');
                    }}
                    className="mt-4 rounded-lg bg-[#84CC16] px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer"
                  >
                    Ver todos los productos
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map((product) => {
                  const stock = roundQty(getProductStock(product));
                  const maxStock = stock > 0 ? stock : 999;
                  const qtyInCart = getCartQty(product.id);
                  const priceVes = round2(product.priceUsd * exchangeRate);
                  const isFractional = isWeightOrVolumeUnit(product.unit);
                  const qtyStep = getQuantityStep(product.unit);

                  return (
                    <article
                      key={product.id}
                      className={`flex flex-col justify-between overflow-hidden rounded-xl border bg-white p-2.5 sm:p-3 transition-colors ${
                        qtyInCart > 0
                          ? 'border-[#76B900] ring-1 ring-[#84CC16]/30'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <ProductImageBox
                          src={product.imageUrl || product.image_url}
                          name={product.name}
                          alt={product.name}
                          fit="contain"
                          className="h-28 w-full rounded-lg bg-slate-50 sm:h-36"
                        />

                        <div className="mt-2.5 space-y-1">
                          <p className="truncate text-[11px] text-slate-500">
                            {product.category || 'General'} · {product.unit || 'und'}
                            {stock > 0 ? ` · ${formatQuantity(stock)} disp.` : ''}
                          </p>
                          <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900 sm:text-sm">
                            {product.name}
                          </h2>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-2.5">
                        <div className="tabular-nums">
                          <p className="text-sm font-extrabold tracking-tight text-slate-950 sm:text-base">
                            {formatVes(priceVes)}
                          </p>
                          <p className="font-mono text-xs font-semibold text-[#558B00]">
                            {formatUsd(product.priceUsd)} USD
                            {isFractional ? ` / ${product.unit}` : ''}
                          </p>
                        </div>

                        {qtyInCart > 0 ? (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="inline-flex flex-1 items-center justify-between rounded-lg border border-[#84CC16]/60 bg-[#F7FEE7]">
                              <button
                                type="button"
                                onClick={() => updateItemQty(product.id, -qtyStep)}
                                aria-label={`Disminuir ${product.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-l-lg text-[#3F6212] hover:bg-[#ECFCCB] transition-colors cursor-pointer"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  if (isFractional) {
                                    const cardEl = e.currentTarget.closest('article') as HTMLElement | null;
                                    handleSelectProduct(product, cardEl ?? e.currentTarget);
                                  }
                                }}
                                className={`px-1 text-xs font-bold tabular-nums text-[#3F6212] ${
                                  isFractional ? 'cursor-pointer hover:underline' : 'cursor-default'
                                }`}
                              >
                                {formatQuantity(qtyInCart)}
                                {isFractional ? ` ${product.unit}` : ''}
                              </button>
                              <button
                                type="button"
                                disabled={qtyInCart >= maxStock - 0.0001}
                                onClick={(e) => {
                                  const cardEl = e.currentTarget.closest('article') as HTMLElement | null;
                                  handleSelectProduct(product, cardEl ?? e.currentTarget);
                                }}
                                aria-label={`Agregar otro ${product.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-r-lg text-[#3F6212] hover:bg-[#ECFCCB] disabled:opacity-40 transition-colors cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              const cardEl = e.currentTarget.closest('article') as HTMLElement | null;
                              handleSelectProduct(product, cardEl ?? e.currentTarget);
                            }}
                            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-3 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Agregar
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Desktop & Tablet Side Order Panel (md and up) */}
        <aside className="hidden shrink-0 flex-col border-l border-slate-200 bg-white md:flex md:w-[330px] lg:w-[375px]">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-[#558B00]" />
              <h2 className="text-sm font-bold text-slate-900">
                Tu pedido ({formatQuantity(cartSummary.itemCount)})
              </h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
              >
                Vaciar
              </button>
            )}
          </div>
          {renderOrderContent(true)}
        </aside>
      </div>

      {/* Phone-Only Compact Fixed Bottom Cart Bar (< 768px / md:hidden) */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 block border-t border-slate-200 bg-white px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-lg md:hidden">
          <button
            ref={mobileCartBarRef}
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-left text-white cursor-pointer"
          >
            <span className="inline-flex items-center gap-2 text-xs font-semibold">
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#84CC16] px-1.5 text-xs font-extrabold tabular-nums text-slate-950">
                {formatQuantity(cartSummary.itemCount)}
              </span>
              <span>Ver pedido</span>
            </span>

            <span className="text-right tabular-nums">
              <span className="block text-xs font-bold leading-tight">
                {formatVes(cartSummary.totalVes)}
              </span>
              <span className="block font-mono text-[11px] font-medium text-[#BEF264]">
                {formatUsd(cartSummary.totalUsd)} USD
              </span>
            </span>
          </button>
        </div>
      )}

      {/* Phone-Only Expandable Slide-Up Bottom Sheet (< 768px / md:hidden) */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-950/50 md:hidden"
          onClick={() => setSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tu pedido"
            onClick={(e) => e.stopPropagation()}
            className="pos-bottom-sheet flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl supports-[height:100dvh]:max-h-[86dvh]"
          >
            <div className="flex shrink-0 justify-center pt-2 pb-1">
              <span className="h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true" />
            </div>

            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-[#558B00]" />
                <h2 className="text-sm font-bold text-slate-900">
                  Tu pedido ({formatQuantity(cartSummary.itemCount)})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                  >
                    Vaciar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Cerrar pedido"
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {renderOrderContent(false)}
          </div>
        </div>
      )}

      {weightPrompt && (
        <WeightQuantityModal
          product={weightPrompt.product}
          exchangeRate={exchangeRate}
          maxAvailable={
            roundQty(getProductStock(weightPrompt.product)) > 0
              ? roundQty(getProductStock(weightPrompt.product))
              : 999
          }
          currentInCart={getCartQty(weightPrompt.product.id)}
          onConfirm={handleConfirmWeightPrompt}
          onClose={() => setWeightPrompt(null)}
        />
      )}
    </div>
  );
};
