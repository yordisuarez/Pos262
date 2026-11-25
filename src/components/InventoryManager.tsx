import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  Lock,
  PackagePlus,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import type { Branch, Cashier, Product, Sale, StockTransfer } from '../types/pos';
import {
  compressProductImage,
  formatImageSize,
  getSafeProductImageUrl,
  uploadProductImage,
  type CompressedProductImage,
} from '../services/productImage';
import { InventoryValuationPanel } from './InventoryValuationPanel';
import { ProductImageBox } from './ProductImageBox';

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

interface InventoryManagerProps {
  branches: Branch[];
  activeBranchId: string;
  products: Product[];
  transfers: StockTransfer[];
  sales?: Sale[];
  activeCashier: Cashier;
  cloudUserId?: string | null;
  exchangeRate: number;
  canEditInventory?: boolean;
  isBranchLocked?: boolean;
  onLoadStock: (params: {
    branchId: string;
    productId: string;
    quantity: number;
    notes?: string;
  }) => Promise<void>;
  onTransferStock: (params: {
    fromBranchId: string;
    toBranchId: string;
    productId: string;
    quantity: number;
    notes?: string;
  }) => Promise<void>;
  onCreateProduct: (params: {
    name: string;
    sku: string;
    barcode?: string;
    category: string;
    unit: string;
    minStock: number;
    costUsd: number;
    priceUsd: number;
    taxExempt: boolean;
    imageUrl?: string;
    stockByBranch: Record<string, number>;
  }) => Promise<void>;
  onUpdateProduct: (product: Product) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onOpenBranchSettings?: () => void;
}

interface ProductFormState {
  id: string | null;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  minStock: string;
  costUsd: string;
  priceUsd: string;
  taxExempt: boolean;
  imageUrl: string;
  stockByBranch: Record<string, string>;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  branches,
  activeBranchId,
  products,
  transfers,
  sales = [],
  activeCashier,
  cloudUserId = null,
  exchangeRate,
  canEditInventory = true,
  isBranchLocked = false,
  onLoadStock,
  onTransferStock,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onOpenBranchSettings,
}) => {
  const loadSectionRef = useRef<HTMLElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const operationalBranches = useMemo(() => {
    const active = branches.filter((b) => b.isActive);
    const pool = active.length > 0 ? active : branches;
    if (isBranchLocked) {
      const assigned = pool.filter((b) => b.id === activeBranchId);
      return assigned.length > 0 ? assigned : pool.slice(0, 1);
    }
    return pool;
  }, [branches, isBranchLocked, activeBranchId]);

  const visibleBranches = useMemo(() => {
    if (!isBranchLocked) return branches;
    const assigned = branches.filter((b) => b.id === activeBranchId);
    return assigned.length > 0 ? assigned : branches.slice(0, 1);
  }, [branches, isBranchLocked, activeBranchId]);

  const visibleTransfers = useMemo(() => {
    if (!isBranchLocked) return transfers;
    return transfers.filter(
      (t) => t.toBranchId === activeBranchId || t.fromBranchId === activeBranchId
    );
  }, [transfers, isBranchLocked, activeBranchId]);

  const [loadBranchId, setLoadBranchId] = useState<string>(activeBranchId);
  const [loadProductId, setLoadProductId] = useState<string>(products[0]?.id || '');
  const [loadQtyInput, setLoadQtyInput] = useState<string>('10');
  const [loadNotes, setLoadNotes] = useState<string>('');
  const [loadFeedback, setLoadFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const [fromBranchId, setFromBranchId] = useState<string>(activeBranchId);
  const [toBranchId, setToBranchId] = useState<string>(
    operationalBranches.find((b) => b.id !== activeBranchId)?.id || operationalBranches[0]?.id || ''
  );
  const [transferProductId, setTransferProductId] = useState<string>(products[0]?.id || '');
  const [transferQtyInput, setTransferQtyInput] = useState<string>('5');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [transferFeedback, setTransferFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const [inventorySearch, setInventorySearch] = useState<string>('');
  const [catalogFeedback, setCatalogFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState<boolean>(false);
  const [compressingPhoto, setCompressingPhoto] = useState<boolean>(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [stagedImage, setStagedImage] = useState<CompressedProductImage | null>(null);
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | null>(null);

  // Create / Edit product modal state
  const [productModalOpen, setProductModalOpen] = useState<boolean>(false);
  const [productFormError, setProductFormError] = useState<string>('');
  const [productForm, setProductForm] = useState<ProductFormState>({
    id: null,
    name: '',
    sku: '',
    barcode: '',
    category: 'Víveres',
    unit: 'und',
    minStock: '5',
    costUsd: '0.00',
    priceUsd: '0.00',
    taxExempt: false,
    imageUrl: '',
    stockByBranch: {},
  });

  const revokeStagedPreview = (url: string | null) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    return () => {
      revokeStagedPreview(stagedPreviewUrl);
    };
  }, [stagedPreviewUrl]);

  useEffect(() => {
    if (isBranchLocked) {
      setLoadBranchId(activeBranchId);
      setFromBranchId(activeBranchId);
      return;
    }
    if (!operationalBranches.some((b) => b.id === loadBranchId)) {
      setLoadBranchId(operationalBranches[0]?.id || '');
    }
    if (!operationalBranches.some((b) => b.id === fromBranchId)) {
      setFromBranchId(operationalBranches[0]?.id || '');
    }
    if (!operationalBranches.some((b) => b.id === toBranchId)) {
      const alt = operationalBranches.find((b) => b.id !== fromBranchId) || operationalBranches[0];
      setToBranchId(alt?.id || '');
    }
  }, [operationalBranches, loadBranchId, fromBranchId, toBranchId, isBranchLocked, activeBranchId]);

  useEffect(() => {
    if (products.length > 0) {
      if (!products.some((p) => p.id === loadProductId)) {
        setLoadProductId(products[0].id);
      }
      if (!products.some((p) => p.id === transferProductId)) {
        setTransferProductId(products[0].id);
      }
    } else {
      setLoadProductId('');
      setTransferProductId('');
    }
  }, [products, loadProductId, transferProductId]);

  const existingCategories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return unique.length > 0 ? unique : ['Víveres', 'Bebidas', 'Snacks', 'Limpieza', 'General'];
  }, [products]);

  const selectedTransferProduct = useMemo(
    () => products.find((p) => p.id === transferProductId) || products[0],
    [products, transferProductId]
  );

  const availableInSource = selectedTransferProduct
    ? selectedTransferProduct.stockByBranch[fromBranchId] ?? 0
    : 0;

  const filteredProducts = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [products, inventorySearch]);

  const resetStagedPhoto = () => {
    revokeStagedPreview(stagedPreviewUrl);
    setStagedPreviewUrl(null);
    setStagedImage(null);
    setCompressingPhoto(false);
    setUploadingPhoto(false);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  const closeProductModal = () => {
    resetStagedPhoto();
    setProductModalOpen(false);
  };

  const handleSelectProductPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setProductFormError('');
    setCompressingPhoto(true);
    try {
      const compressed = await compressProductImage(file, {
        maxDimension: 600,
        quality: 0.78,
      });
      const previewUrl = URL.createObjectURL(compressed.blob);
      revokeStagedPreview(stagedPreviewUrl);
      setStagedImage(compressed);
      setStagedPreviewUrl(previewUrl);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo procesar la foto seleccionada.';
      setProductFormError(message);
    } finally {
      setCompressingPhoto(false);
    }
  };

  const handleClearProductPhoto = () => {
    resetStagedPhoto();
    setProductForm((prev) => ({ ...prev, imageUrl: '' }));
  };

  const openCreateProductModal = () => {
    if (!canEditInventory) return;
    resetStagedPhoto();
    const initialStocks: Record<string, string> = {};
    visibleBranches.forEach((b) => {
      initialStocks[b.id] = '0';
    });
    setProductForm({
      id: null,
      name: '',
      sku: '',
      barcode: '',
      category: existingCategories[0] || 'General',
      unit: 'und',
      minStock: '5',
      costUsd: '1.00',
      priceUsd: '1.50',
      taxExempt: false,
      imageUrl: '',
      stockByBranch: initialStocks,
    });
    setProductFormError('');
    setProductModalOpen(true);
  };

  const openEditProductModal = (product: Product) => {
    if (!canEditInventory) return;
    resetStagedPhoto();
    const stocks: Record<string, string> = {};
    visibleBranches.forEach((b) => {
      stocks[b.id] = String(product.stockByBranch[b.id] ?? 0);
    });
    setProductForm({
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      category: product.category,
      unit: product.unit || 'und',
      minStock: String(product.minStock),
      costUsd: product.costUsd.toFixed(2),
      priceUsd: product.priceUsd.toFixed(2),
      taxExempt: Boolean(product.taxExempt),
      imageUrl: product.imageUrl || product.image_url || '',
      stockByBranch: stocks,
    });
    setProductFormError('');
    setProductModalOpen(true);
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditInventory) return;
    setProductFormError('');
    setCatalogFeedback(null);

    const trimmedName = productForm.name.trim();
    const trimmedSku = productForm.sku.trim().toUpperCase();
    const trimmedCategory = productForm.category.trim() || 'General';
    const trimmedUnit = productForm.unit.trim() || 'und';
    const parsedMinStock = Math.max(0, parseInt(productForm.minStock, 10) || 0);
    const parsedCost = parseFloat(productForm.costUsd.replace(',', '.'));
    const parsedPrice = parseFloat(productForm.priceUsd.replace(',', '.'));

    if (!trimmedName) {
      setProductFormError('El nombre del producto es obligatorio.');
      return;
    }
    if (!trimmedSku) {
      setProductFormError('El código SKU es obligatorio.');
    return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      setProductFormError('Ingresa un costo en USD válido (0 o mayor).');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setProductFormError('Ingresa un precio de venta en USD mayor a 0.');
      return;
    }

    const parsedStockByBranch: Record<string, number> = {};
    for (const branch of visibleBranches) {
      const rawVal = productForm.stockByBranch[branch.id] ?? '0';
      const qty = parseInt(rawVal, 10);
      if (!Number.isFinite(qty) || qty < 0) {
        setProductFormError(`Stock inválido para ${branch.name}. Debe ser 0 o mayor.`);
        return;
      }
      parsedStockByBranch[branch.id] = qty;
    }

    setSavingProduct(true);
    try {
      let resolvedImageUrl: string | undefined =
        getSafeProductImageUrl(productForm.imageUrl) ?? undefined;

      if (stagedImage) {
        setUploadingPhoto(true);
        try {
          resolvedImageUrl = await uploadProductImage(stagedImage, {
            userId: cloudUserId,
            skuOrId: trimmedSku || productForm.id || trimmedName,
          });
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'No se pudo subir la foto del producto. Intenta nuevamente o quita la foto.';
          setProductFormError(message);
          return;
        } finally {
          setUploadingPhoto(false);
        }
      }

      if (productForm.id) {
        const original = products.find((p) => p.id === productForm.id);
        if (!original) return;
        await onUpdateProduct({
          ...original,
          name: trimmedName,
          sku: trimmedSku,
          barcode: productForm.barcode.trim() || undefined,
          category: trimmedCategory,
          unit: trimmedUnit,
          minStock: parsedMinStock,
          costUsd: round2(parsedCost),
          priceUsd: round2(parsedPrice),
          taxExempt: productForm.taxExempt,
          imageUrl: resolvedImageUrl,
          image_url: resolvedImageUrl,
          stockByBranch: {
            ...original.stockByBranch,
            ...parsedStockByBranch,
          },
        });
        setCatalogFeedback({
          type: 'ok',
          text: `Producto "${trimmedName}" y sus existencias actualizados correctamente.`,
        });
      } else {
        await onCreateProduct({
          name: trimmedName,
          sku: trimmedSku,
          barcode: productForm.barcode.trim() || undefined,
          category: trimmedCategory,
          unit: trimmedUnit,
          minStock: parsedMinStock,
          costUsd: round2(parsedCost),
          priceUsd: round2(parsedPrice),
          taxExempt: productForm.taxExempt,
          imageUrl: resolvedImageUrl,
          stockByBranch: parsedStockByBranch,
        });
        setCatalogFeedback({
          type: 'ok',
          text: `Producto "${trimmedName}" creado y guardado en inventario.`,
        });
      }
      closeProductModal();
    } finally {
      setSavingProduct(false);
    }
  };

  const handleConfirmDeleteProduct = async (product: Product) => {
    if (!canEditInventory) return;
    await onDeleteProduct(product.id);
    setConfirmDeleteProductId(null);
    setCatalogFeedback({
      type: 'ok',
      text: `Producto "${product.name}" eliminado del catálogo.`,
    });
  };

  const handleLoadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditInventory) return;
    setLoadFeedback(null);

    const targetBranchId = isBranchLocked ? activeBranchId : loadBranchId;
    const qty = parseInt(loadQtyInput, 10);
    if (!loadProductId || !targetBranchId || !Number.isFinite(qty) || qty <= 0) {
      setLoadFeedback({ type: 'err', text: 'Ingresa una cantidad entera mayor a 0.' });
      return;
    }

    await onLoadStock({
      branchId: targetBranchId,
      productId: loadProductId,
      quantity: qty,
      notes: loadNotes.trim() || undefined,
    });

    const branchName = branches.find((b) => b.id === targetBranchId)?.name ?? '';
    const productName = products.find((p) => p.id === loadProductId)?.name ?? '';
    setLoadNotes('');
    setLoadFeedback({
      type: 'ok',
      text: `Se cargaron +${qty} und de "${productName}" en ${branchName}.`,
    });
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditInventory || isBranchLocked) return;
    setTransferFeedback(null);

    const qty = parseInt(transferQtyInput, 10);
    if (fromBranchId === toBranchId) {
      setTransferFeedback({
        type: 'err',
        text: 'La sucursal de origen y la sucursal de destino deben ser diferentes.',
      });
      return;
    }
    if (!transferProductId || !Number.isFinite(qty) || qty <= 0) {
      setTransferFeedback({ type: 'err', text: 'Ingresa una cantidad entera mayor a 0.' });
      return;
    }
    if (qty > availableInSource) {
      setTransferFeedback({
        type: 'err',
        text: `Stock insuficiente en la sucursal de origen (disponible: ${availableInSource} und).`,
      });
      return;
    }

    await onTransferStock({
      fromBranchId,
      toBranchId,
      productId: transferProductId,
      quantity: qty,
      notes: transferNotes.trim() || undefined,
    });

    const fromName = branches.find((b) => b.id === fromBranchId)?.name ?? '';
    const toName = branches.find((b) => b.id === toBranchId)?.name ?? '';
    const productName = selectedTransferProduct?.name ?? '';
    setTransferNotes('');
    setTransferFeedback({
      type: 'ok',
      text: `Traslado registrado: ${qty} und de "${productName}" (${fromName} → ${toName}).`,
    });
  };

  const previewPriceUsd = parseFloat(productForm.priceUsd.replace(',', '.'));
  const previewPriceVes =
    Number.isFinite(previewPriceUsd) && previewPriceUsd > 0
      ? round2(previewPriceUsd * exchangeRate)
      : 0;

  const valuationRefreshKey = useMemo(() => {
    const prodSig = products
      .map(
        (p) =>
          `${p.id}:${p.costUsd}:${p.priceUsd}:${p.minStock}:${p.category}:${Object.entries(
            p.stockByBranch
          )
            .map(([k, v]) => `${k}=${v}`)
            .join(',')}`
      )
      .join('|');
    return `${products.length}-${transfers.length}-${sales.length}-${branches.length}-${prodSig}`;
  }, [products, transfers.length, sales.length, branches.length]);

  const handleQuickRestock = (productId: string, branchId: string, suggestedQty: number) => {
    if (!canEditInventory) return;
    if (!isBranchLocked && branchId) {
      setLoadBranchId(branchId);
    }
    setLoadProductId(productId);
    setLoadQtyInput(String(Math.max(1, suggestedQty)));
    setLoadFeedback(null);
    loadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-5">
      {!canEditInventory && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          <Lock className="h-4 w-4 shrink-0 text-slate-400" />
          <span>
            <strong className="text-slate-900">Modo solo lectura:</strong> puedes consultar las existencias de tu sucursal, pero no modificar cantidades, precios ni eliminar productos.
          </span>
        </div>
      )}

      <InventoryValuationPanel
        branches={branches}
        activeBranchId={activeBranchId}
        exchangeRate={exchangeRate}
        isBranchLocked={isBranchLocked}
        canEditInventory={canEditInventory}
        refreshKey={valuationRefreshKey}
        onQuickRestock={canEditInventory ? handleQuickRestock : undefined}
        onCreateProduct={canEditInventory ? openCreateProductModal : undefined}
      />

      {canEditInventory && (
        <div className={`grid grid-cols-1 gap-5 ${isBranchLocked ? '' : 'lg:grid-cols-2'}`}>
          <section
            ref={loadSectionRef}
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <PackagePlus className="h-4 w-4 text-[#76B900]" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Cargar stock a sucursal</h2>
                <p className="text-xs text-slate-500">
                  Ingreso de mercancía por tienda · {activeCashier.name}
                </p>
              </div>
            </div>

            <form onSubmit={handleLoadSubmit} className="mt-3.5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Sucursal destino {isBranchLocked ? '(Fija)' : ''}
                </label>
                <select
                  value={isBranchLocked ? activeBranchId : loadBranchId}
                  disabled={isBranchLocked}
                  onChange={(e) => {
                    if (!isBranchLocked) setLoadBranchId(e.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-75"
                >
                  {operationalBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
              </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Producto</label>
              <select
                value={loadProductId}
                onChange={(e) => setLoadProductId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} — {product.name} (Actual:{' '}
                    {product.stockByBranch[loadBranchId] ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Cantidad *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={loadQtyInput}
                  onChange={(e) => setLoadQtyInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Referencia / Proveedor (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Factura proveedor #8841"
                  value={loadNotes}
                  onChange={(e) => setLoadNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {loadFeedback && (
              <p
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  loadFeedback.type === 'ok'
                    ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212]'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {loadFeedback.type === 'ok' && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
                )}
                {loadFeedback.text}
              </p>
            )}

            <button
              type="submit"
              disabled={products.length === 0 || operationalBranches.length === 0}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-3 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              Cargar stock
            </button>
          </form>
        </section>

        {!isBranchLocked && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <ArrowLeftRight className="h-4 w-4 text-slate-800" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Traslado entre sucursales</h2>
              <p className="text-xs text-slate-500">
                Descuenta del origen, suma en el destino y guarda historial offline-first
              </p>
            </div>
          </div>

          <form onSubmit={handleTransferSubmit} className="mt-3.5 space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Sucursal origen</label>
                <select
                  value={fromBranchId}
                  onChange={(e) => {
                    setFromBranchId(e.target.value);
                    setTransferFeedback(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                >
                  {operationalBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Sucursal destino</label>
                <select
                  value={toBranchId}
                  onChange={(e) => {
                    setToBranchId(e.target.value);
                    setTransferFeedback(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                >
                  {operationalBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">Producto</label>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-600">
                  Disponible: {availableInSource} und
                </span>
              </div>
              <select
                value={transferProductId}
                onChange={(e) => {
                  setTransferProductId(e.target.value);
                  setTransferFeedback(null);
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} — {product.name} (Origen:{' '}
                    {product.stockByBranch[fromBranchId] ?? 0} → Destino:{' '}
                    {product.stockByBranch[toBranchId] ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Cantidad *</label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, availableInSource)}
                  step="1"
                  required
                  value={transferQtyInput}
                  onChange={(e) => setTransferQtyInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Motivo / Guía (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Reposición de anaquel Sucursal Norte"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {transferFeedback && (
              <p
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  transferFeedback.type === 'ok'
                    ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212]'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {transferFeedback.type === 'ok' && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
                )}
                {transferFeedback.text}
              </p>
            )}

            <button
              type="submit"
              disabled={products.length === 0 || operationalBranches.length < 2}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Registrar traslado
            </button>
          </form>
        </section>
        )}
      </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-slate-700" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Catálogo y existencias por sucursal ({products.length})
              </h2>
              <p className="text-xs text-slate-500">
                Crea productos nuevos o edita directamente precio, costo y stock por tienda sin duplicados
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Filtrar producto o SKU..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
              />
            </div>

            {onOpenBranchSettings && !isBranchLocked && (
              <button
                type="button"
                onClick={onOpenBranchSettings}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Building2 className="h-3.5 w-3.5 text-slate-500" />
                Sucursales
              </button>
            )}

            {canEditInventory && (
              <button
                type="button"
                onClick={openCreateProductModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors whitespace-nowrap cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Nuevo producto
              </button>
            )}
          </div>
        </div>

        {catalogFeedback && (
          <p
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
              catalogFeedback.type === 'ok'
                ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212]'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {catalogFeedback.type === 'ok' && (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
            )}
            {catalogFeedback.text}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-semibold">Producto</th>
                <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Precio / Costo</th>
                {visibleBranches.map((branch) => (
                  <th
                    key={branch.id}
                    className="py-2 px-3 font-semibold text-right whitespace-nowrap"
                  >
                    <span>{branch.name}</span>
                    {!branch.isActive && (
                      <span className="ml-1 text-[10px] font-normal text-slate-400">(Inactiva)</span>
                    )}
                  </th>
                ))}
                {!isBranchLocked && (
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Total red</th>
                )}
                {canEditInventory && (
                  <th className="py-2 pl-3 font-semibold text-right whitespace-nowrap">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => {
                const totalNetwork = visibleBranches.reduce(
                  (sum, b) => sum + (product.stockByBranch[b.id] ?? 0),
                  0
                );
                const isConfirmingDelete = confirmDeleteProductId === product.id;

                return (
                  <tr key={product.id} className="hover:bg-slate-50/70">
                    <td className="py-2 pr-4">
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-mono">{product.sku}</span> · {product.category} · Mín:{' '}
                        {product.minStock} {product.unit}
                      </p>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <p className="font-bold text-slate-900">{formatUsd(product.priceUsd)}</p>
                      <p className="text-[11px] text-slate-500">
                        Costo {formatUsd(product.costUsd)}
                      </p>
                    </td>
                    {visibleBranches.map((branch) => {
                      const qty = product.stockByBranch[branch.id] ?? 0;
                      const isZero = qty <= 0;
                      const isLow = qty > 0 && qty <= product.minStock;
                      return (
                        <td
                          key={branch.id}
                          className={`py-2 px-3 text-right font-mono font-semibold tabular-nums ${
                            !branch.isActive
                              ? 'text-slate-400'
                              : isZero
                              ? 'text-red-600'
                              : isLow
                              ? 'text-amber-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {qty}
                        </td>
                      );
                    })}
                    {!isBranchLocked && (
                      <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                        {totalNetwork}
                      </td>
                    )}
                    {canEditInventory && (
                      <td className="py-2 pl-3 text-right whitespace-nowrap">
                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleConfirmDeleteProduct(product)}
                              className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-700 cursor-pointer"
                            >
                              Eliminar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteProductId(null)}
                              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditProductModal(product)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#76B900] hover:text-slate-900 cursor-pointer"
                            >
                              <Pencil className="h-3 w-3" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteProductId(product.id)}
                              aria-label={`Eliminar ${product.name}`}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleBranches.length + (isBranchLocked ? 2 : 3) + (canEditInventory ? 1 : 0)}
                    className="py-6 text-center text-xs text-slate-500"
                  >
                    No se encontraron productos con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="text-sm font-bold text-slate-900">
            Historial de cargas y traslados ({visibleTransfers.length})
          </h2>
          <p className="text-xs text-slate-500">
            Registro auditable almacenado en IndexedDB con estado de sincronización
          </p>
        </div>

        {visibleTransfers.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Aún no se han registrado cargas de inventario ni traslados entre sucursales.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleTransfers.map((movement) => (
              <div
                key={movement.id}
                className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">
                    {movement.type === 'load' ? 'Carga de stock' : 'Traslado'}:{' '}
                    <span className="font-mono text-[#558B00] tabular-nums">
                      +{movement.quantity} und
                    </span>{' '}
                    · {movement.productName}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    {movement.type === 'transfer' ? (
                      <>
                        <span className="font-medium text-slate-700">
                          {movement.fromBranchName}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="font-medium text-slate-700">{movement.toBranchName}</span>
                      </>
                    ) : (
                      <span className="font-medium text-slate-700">
                        Destino: {movement.toBranchName}
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{movement.cashierName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {new Date(movement.createdAt).toLocaleString('es-VE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </p>
                  {movement.notes && (
                    <p className="mt-0.5 text-[11px] text-slate-600">Nota: {movement.notes}</p>
                  )}
                </div>

                <span
                  className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                    movement.syncStatus === 'synced' ? 'text-[#558B00]' : 'text-amber-700'
                  }`}
                >
                  {movement.syncStatus === 'synced' ? 'Sincronizado' : 'Pendiente offline'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {productForm.id ? 'Editar producto y existencias' : 'Nuevo producto en inventario'}
                </h3>
                <p className="text-xs text-slate-500">
                  Los cambios actualizan IndexedDB y se sincronizan automáticamente con Supabase
                </p>
              </div>
              <button
                type="button"
                onClick={closeProductModal}
                aria-label="Cerrar editor de producto"
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveProductForm}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Nombre del producto *
                  </label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    placeholder="Ej: Harina de Maíz Precocida 1 kg"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  {(() => {
                    const activePreview =
                      stagedPreviewUrl || getSafeProductImageUrl(productForm.imageUrl);
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ProductImageBox
                            src={activePreview}
                            name={productForm.name}
                            alt="Vista previa del producto"
                            allowBlobPreview={Boolean(stagedPreviewUrl)}
                            className="h-12 w-12 shrink-0 rounded-lg bg-slate-50"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800">
                              Foto del producto (opcional)
                            </p>
                            <p className="truncate text-[11px] text-slate-500">
                              {compressingPhoto
                                ? 'Optimizando imagen...'
                                : stagedImage
                                ? `Lista · ${stagedImage.width}×${stagedImage.height}px · ${formatImageSize(
                                    stagedImage.sizeBytes
                                  )} (${stagedImage.extension.toUpperCase()})`
                                : activePreview
                                ? 'Foto guardada en la nube'
                                : 'Se comprime automáticamente (máx. 600px)'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
                            onChange={(e) => void handleSelectProductPhoto(e)}
                            className="hidden"
                          />
                          <button
                            type="button"
                            disabled={compressingPhoto || savingProduct}
                            onClick={() => photoInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#76B900] hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Camera className="h-3.5 w-3.5 text-[#558B00]" />
                            {activePreview ? 'Cambiar' : 'Agregar foto'}
                          </button>
                          {activePreview && (
                            <button
                              type="button"
                              disabled={compressingPhoto || savingProduct}
                              onClick={handleClearProductPhoto}
                              aria-label="Quitar foto del producto"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Código SKU Opcional</label>
                  <input
                    type="text"
                  
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    placeholder="Ej: VIV-105"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs uppercase text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Código de barras (opcional)
                  </label>
                  <input
                    type="text"
                    value={productForm.barcode}
                    onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                    placeholder="759100..."
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Categoría *</label>
                  <input
                    type="text"
                    list="inventory-product-categories"
                    required
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    placeholder="Víveres, Bebidas..."
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                  <datalist id="inventory-product-categories">
                    {existingCategories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Unidad</label>
                    <input
                      type="text"
                      value={productForm.unit}
                      onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                      placeholder="und"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Stock mínimo</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.minStock}
                      onChange={(e) => setProductForm({ ...productForm, minStock: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Costo unitario (USD $) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={productForm.costUsd}
                    onChange={(e) => setProductForm({ ...productForm, costUsd: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Precio venta (USD $) *
                    </label>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-[#558B00]">
                      {formatVes(previewPriceVes)}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={productForm.priceUsd}
                    onChange={(e) => setProductForm({ ...productForm, priceUsd: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={productForm.taxExempt}
                  onChange={(e) => setProductForm({ ...productForm, taxExempt: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-[#76B900]"
                />
                Producto exento de IVA (16%)
              </label>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Existencias directas por sucursal
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Ajusta directamente la cantidad real disponible en cada tienda
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {visibleBranches.map((branch) => (
                    <div key={branch.id}>
                      <label className="block truncate text-[11px] font-semibold text-slate-700">
                        {branch.name} ({branch.code})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={productForm.stockByBranch[branch.id] ?? '0'}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            stockByBranch: {
                              ...productForm.stockByBranch,
                              [branch.id]: e.target.value,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {productFormError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {productFormError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={closeProductModal}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProduct || compressingPhoto}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  {uploadingPhoto
                    ? 'Subiendo foto...'
                    : savingProduct
                    ? 'Guardando...'
                    : productForm.id
                    ? 'Guardar cambios'
                    : 'Crear producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
