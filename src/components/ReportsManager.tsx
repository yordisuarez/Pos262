import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Pencil,
  Save,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import type {
  Branch,
  CartItem,
  CurrencyMode,
  Product,
  ReportPeriod,
  Sale,
  SalePayment,
  SaleType,
} from '../types/pos';

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

interface ReportsManagerProps {
  sales: Sale[];
  products: Product[];
  branches: Branch[];
  currency: CurrencyMode;
  exchangeRate: number;
  onSettleReceivable: (saleId: string, amountUsd: number) => Promise<void>;
  onUpdateSale: (updatedSale: Sale) => Promise<void>;
  onDeleteSale: (saleId: string) => Promise<void>;
}

interface EditableSaleItem extends CartItem {
  quantityInput: string;
  priceInput: string;
}

export const ReportsManager: React.FC<ReportsManagerProps> = ({
  sales,
  products,
  branches,
  currency,
  exchangeRate,
  onSettleReceivable,
  onUpdateSale,
  onDeleteSale,
}) => {
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas');
  const [query, setQuery] = useState<string>('');
  const [settlingSaleId, setSettlingSaleId] = useState<string | null>(null);
  const [confirmDeleteSaleId, setConfirmDeleteSaleId] = useState<string | null>(null);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  // Sale editor modal state
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editSaleType, setEditSaleType] = useState<SaleType>('cash');
  const [editItems, setEditItems] = useState<EditableSaleItem[]>([]);
  const [editPaidUsdInput, setEditPaidUsdInput] = useState<string>('0.00');
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editError, setEditError] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const formatPrimary = (usd: number): string =>
    currency === 'USD' ? formatUsd(usd) : formatVes(round2(usd * exchangeRate));

  const formatSecondary = (usd: number): string =>
    currency === 'USD' ? formatVes(round2(usd * exchangeRate)) : formatUsd(usd);

  const productCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.id, p.category));
    return map;
  }, [products]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.category)));
    return ['Todas', ...unique];
  }, [products]);

  const periodRangeStart = useMemo(() => {
    const now = new Date();
    if (period === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return start.getTime();
    }
    if (period === 'week') {
      return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    }
    if (period === 'month') {
      return now.getTime() - 30 * 24 * 60 * 60 * 1000;
    }
    return 0;
  }, [period]);

  const filteredData = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const hasItemFilter = categoryFilter !== 'Todas' || normalizedQuery.length > 0;

    let totalRevenueUsd = 0;
    let totalCostUsd = 0;
    let totalPaidUsd = 0;
    let totalReceivableUsd = 0;
    const matchedSales: Sale[] = [];
    const soldQtyByProduct = new Map<string, number>();

    sales.forEach((sale) => {
      if (branchFilter !== 'all' && sale.branchId !== branchFilter) return;
      const createdMs = new Date(sale.createdAt).getTime();
      if (createdMs < periodRangeStart) return;

      const matchingItems = sale.items.filter((item) => {
        const itemCategory = productCategoryMap.get(item.productId) ?? 'General';
        const matchesCat = categoryFilter === 'Todas' || itemCategory === categoryFilter;
        if (!matchesCat) return false;
        if (!normalizedQuery) return true;
        return (
          item.name.toLowerCase().includes(normalizedQuery) ||
          item.sku.toLowerCase().includes(normalizedQuery) ||
          itemCategory.toLowerCase().includes(normalizedQuery)
        );
      });

      if (matchingItems.length === 0) return;

      matchedSales.push(sale);

      const itemsRevenueUsd = round2(
        matchingItems.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0)
      );
      const itemsCostUsd = round2(
        matchingItems.reduce((sum, item) => sum + item.costUsd * item.quantity, 0)
      );

      matchingItems.forEach((item) => {
        soldQtyByProduct.set(
          item.productId,
          (soldQtyByProduct.get(item.productId) ?? 0) + item.quantity
        );
      });

      if (!hasItemFilter) {
        totalRevenueUsd = round2(totalRevenueUsd + sale.totalUsd);
        totalCostUsd = round2(totalCostUsd + itemsCostUsd);
        const netCollected = round2(Math.min(sale.totalUsd, sale.paidUsd));
        totalPaidUsd = round2(totalPaidUsd + netCollected);
        totalReceivableUsd = round2(totalReceivableUsd + sale.pendingUsd);
      } else {
        const ratio = sale.subtotalUsd > 0 ? itemsRevenueUsd / sale.subtotalUsd : 1;
        const proportionalTotal = round2(sale.totalUsd * ratio);
        const proportionalPaid = round2(Math.min(sale.totalUsd, sale.paidUsd) * ratio);
        const proportionalPending = round2(sale.pendingUsd * ratio);

        totalRevenueUsd = round2(totalRevenueUsd + proportionalTotal);
        totalCostUsd = round2(totalCostUsd + itemsCostUsd);
        totalPaidUsd = round2(totalPaidUsd + proportionalPaid);
        totalReceivableUsd = round2(totalReceivableUsd + proportionalPending);
      }
    });

    const estimatedProfitUsd = round2(totalRevenueUsd - totalCostUsd);
    const marginPercent =
      totalRevenueUsd > 0 ? round2((estimatedProfitUsd / totalRevenueUsd) * 100) : 0;

    return {
      matchedSales,
      totalRevenueUsd,
      totalCostUsd,
      estimatedProfitUsd,
      marginPercent,
      totalPaidUsd,
      totalReceivableUsd,
      soldQtyByProduct,
    };
  }, [sales, branchFilter, periodRangeStart, categoryFilter, query, productCategoryMap]);

  const openReceivables = useMemo(
    () => filteredData.matchedSales.filter((sale) => sale.pendingUsd > 0),
    [filteredData.matchedSales]
  );

  const stockTurnoverRows = useMemo(() => {
    return products
      .map((product) => {
        const stock =
          branchFilter === 'all'
            ? Object.values(product.stockByBranch).reduce((a, b) => a + b, 0)
            : product.stockByBranch[branchFilter] ?? 0;
        const soldQty = filteredData.soldQtyByProduct.get(product.id) ?? 0;
        const threshold =
          branchFilter === 'all' ? product.minStock * Math.max(1, branches.length) : product.minStock;
        return {
          product,
          stock,
          soldQty,
          isLow: stock <= threshold,
        };
      })
      .sort((a, b) => b.soldQty - a.soldQty || a.stock - b.stock);
  }, [products, branchFilter, branches.length, filteredData.soldQtyByProduct]);

  const handleMarkPaid = async (sale: Sale) => {
    setSettlingSaleId(sale.id);
    setFeedback('');
    try {
      await onSettleReceivable(sale.id, sale.pendingUsd);
      setFeedback(
        `Cobro registrado para recibo ${sale.receiptNumber} (${formatUsd(sale.pendingUsd)}).`
      );
    } finally {
      setSettlingSaleId(null);
    }
  };

  const openEditSaleModal = (sale: Sale) => {
    setEditingSale(sale);
    setEditSaleType(sale.saleType);
    setEditItems(
      sale.items.map((item) => ({
        ...item,
        quantityInput: String(item.quantity),
        priceInput: item.priceUsd.toFixed(2),
      }))
    );
    setEditPaidUsdInput(sale.paidUsd.toFixed(2));
    setEditDueDate(sale.dueDate || '');
    setEditNotes(sale.notes || '');
    setEditError('');
  };

  const editPreview = useMemo(() => {
    if (!editingSale) return null;
    const rate = editingSale.exchangeRate > 0 ? editingSale.exchangeRate : exchangeRate;
    const parsedItems = editItems.map((item) => {
      const qty = Math.max(0, parseInt(item.quantityInput, 10) || 0);
      const price = Math.max(0, parseFloat(item.priceInput.replace(',', '.')) || 0);
      return { ...item, quantity: qty, priceUsd: round2(price) };
    });

    const subtotalUsd = round2(
      parsedItems.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0)
    );
    const taxRate = editingSale.taxRate || 0;
    const taxableUsd = parsedItems.reduce(
      (sum, item) => sum + (item.taxExempt ? 0 : item.priceUsd * item.quantity),
      0
    );
    const taxUsd = round2(taxableUsd * taxRate);
    const totalUsd = round2(subtotalUsd + taxUsd);
    const totalVes = round2(totalUsd * rate);

    const parsedPaid = parseFloat(editPaidUsdInput.replace(',', '.'));
    const safePaidUsd = Number.isFinite(parsedPaid) && parsedPaid >= 0 ? round2(parsedPaid) : 0;
    const pendingUsd =
      editSaleType === 'credit' ? round2(Math.max(0, totalUsd - safePaidUsd)) : 0;
    const changeUsd = round2(Math.max(0, safePaidUsd - totalUsd));

    return {
      rate,
      parsedItems,
      subtotalUsd,
      taxRate,
      taxUsd,
      totalUsd,
      totalVes,
      paidUsd: safePaidUsd,
      pendingUsd,
      changeUsd,
    };
  }, [editingSale, editItems, editPaidUsdInput, editSaleType, exchangeRate]);

  const handleSaveEditedSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale || !editPreview) return;
    setEditError('');

    if (editPreview.parsedItems.length === 0) {
      setEditError('La venta debe mantener al menos un producto.');
      return;
    }
    const invalidItem = editPreview.parsedItems.find(
      (item) => item.quantity <= 0 || item.priceUsd <= 0
    );
    if (invalidItem) {
      setEditError(`Revisa la cantidad y precio de "${invalidItem.name}" (deben ser mayores a 0).`);
      return;
    }
    if (editSaleType === 'cash' && editPreview.paidUsd + 0.01 < editPreview.totalUsd) {
      setEditError(
        `Para una venta de contado el monto pagado debe ser al menos ${formatUsd(
          editPreview.totalUsd
        )}.`
      );
      return;
    }

    // Reconcile payment entries so shift arqueo totals stay aligned with the edited paid amount
    let reconciledPayments: SalePayment[] = [];
    if (editPreview.paidUsd > 0) {
      if (editingSale.payments.length > 0 && editingSale.paidUsd > 0) {
        const scale = editPreview.paidUsd / editingSale.paidUsd;
        reconciledPayments = editingSale.payments.map((p) => {
          const nextUsd = round2(p.amountUsd * scale);
          return {
            ...p,
            amountUsd: nextUsd,
            amountVes: round2(nextUsd * editPreview.rate),
          };
        });
        const sumUsd = round2(reconciledPayments.reduce((s, p) => s + p.amountUsd, 0));
        const roundingDiff = round2(editPreview.paidUsd - sumUsd);
        if (Math.abs(roundingDiff) >= 0.01 && reconciledPayments.length > 0) {
          const last = reconciledPayments[reconciledPayments.length - 1];
          last.amountUsd = round2(Math.max(0, last.amountUsd + roundingDiff));
          last.amountVes = round2(last.amountUsd * editPreview.rate);
        }
      } else {
        reconciledPayments = [
          {
            method: 'Efectivo Divisa $',
            amountUsd: editPreview.paidUsd,
            amountVes: round2(editPreview.paidUsd * editPreview.rate),
            reference: 'Ajuste de venta',
          },
        ];
      }
    }

    const updatedSale: Sale = {
      ...editingSale,
      saleType: editSaleType,
      items: editPreview.parsedItems.map(({ quantityInput: _q, priceInput: _p, ...item }) => item),
      subtotalUsd: editPreview.subtotalUsd,
      taxRate: editPreview.taxRate,
      taxUsd: editPreview.taxUsd,
      totalUsd: editPreview.totalUsd,
      totalVes: editPreview.totalVes,
      paidUsd: editPreview.paidUsd,
      pendingUsd: editPreview.pendingUsd,
      changeUsd: editPreview.changeUsd,
      payments: reconciledPayments,
      dueDate: editSaleType === 'credit' ? editDueDate || undefined : undefined,
      notes: editNotes.trim() || undefined,
    };

    setSavingEdit(true);
    try {
      await onUpdateSale(updatedSale);
      setFeedback(
        `Venta ${updatedSale.receiptNumber} actualizada (${formatUsd(
          updatedSale.totalUsd
        )}). Stock y totales recalculados.`
      );
      setEditingSale(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDeleteSale = async (sale: Sale) => {
    setDeletingSaleId(sale.id);
    setFeedback('');
    try {
      await onDeleteSale(sale.id);
      setConfirmDeleteSaleId(null);
      setFeedback(
        `Venta ${sale.receiptNumber} eliminada. El stock y el arqueo se actualizaron automáticamente.`
      );
    } finally {
      setDeletingSaleId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#76B900]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Reportes de ventas y cuentas por cobrar
              </h2>
              <p className="text-xs text-slate-500">
                Filtra por período, sucursal, categoría o nombre de producto
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 self-start">
            {(
              [
                { id: 'today', label: 'Hoy' },
                { id: 'week', label: 'Semana' },
                { id: 'month', label: 'Mes' },
                { id: 'all', label: 'Todo' },
              ] as Array<{ id: ReportPeriod; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  period === opt.id
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto, SKU o categoría..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>

          <select
            aria-label="Filtrar por categoría"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                Categoría: {cat}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por sucursal"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
          >
            <option value="all">Todas las sucursales</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {feedback && (
        <div className="flex items-center gap-2 rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] px-3.5 py-2 text-xs font-semibold text-[#3F6212]">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#76B900]" />
          {feedback}
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono tabular-nums">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-sans text-xs font-medium text-slate-500">Ingresos totales</p>
          <p
            className={`mt-1 text-lg font-bold ${
              currency === 'VES' ? 'text-[#558B00]' : 'text-slate-900'
            }`}
          >
            {formatPrimary(filteredData.totalRevenueUsd)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className={currency === 'USD' ? 'text-[#558B00] font-semibold' : ''}>
              {formatSecondary(filteredData.totalRevenueUsd)}
            </span>{' '}
            · <span className="font-sans">{filteredData.matchedSales.length} pedidos</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-sans text-xs font-medium text-slate-500">Ganancia y margen estimado</p>
          <p className="mt-1 text-lg font-bold text-[#558B00]">
            {formatPrimary(filteredData.estimatedProfitUsd)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Margen:{' '}
            <span className="font-bold text-slate-800">{filteredData.marginPercent}%</span> · Costo{' '}
            {formatUsd(filteredData.totalCostUsd)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-sans text-xs font-medium text-slate-500">Total cobrado (Pagado)</p>
          <p
            className={`mt-1 text-lg font-bold ${
              currency === 'VES' ? 'text-[#558B00]' : 'text-slate-900'
            }`}
          >
            {formatPrimary(filteredData.totalPaidUsd)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className={currency === 'USD' ? 'text-[#558B00] font-semibold' : ''}>
              {formatSecondary(filteredData.totalPaidUsd)}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-sans text-xs font-medium text-slate-500">Por cobrar (Crédito)</p>
          <p
            className={`mt-1 text-lg font-bold ${
              filteredData.totalReceivableUsd > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {formatPrimary(filteredData.totalReceivableUsd)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className={currency === 'USD' ? 'text-[#558B00] font-semibold' : ''}>
              {formatSecondary(filteredData.totalReceivableUsd)}
            </span>{' '}
            · <span className="font-sans">{openReceivables.length} pendientes</span>
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-amber-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Cuentas por cobrar ({openReceivables.length})
              </h3>
              <p className="text-xs text-slate-500">
                Créditos con saldo pendiente en el período seleccionado
              </p>
            </div>
          </div>
        </div>

        {openReceivables.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            No hay créditos pendientes por cobrar para los filtros activos.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Recibo / Cliente</th>
                  <th className="py-2 px-3 font-semibold">Vencimiento</th>
                  <th className="py-2 px-3 font-semibold text-right">Total</th>
                  <th className="py-2 px-3 font-semibold text-right">Abonado</th>
                  <th className="py-2 px-3 font-semibold text-right">Saldo pendiente</th>
                  <th className="py-2 pl-3 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openReceivables.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/70">
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-slate-900">
                        <span className="font-mono">{sale.receiptNumber}</span> · {sale.customerName}
                      </p>
                      <p className="text-[11px] text-slate-500">{sale.branchName}</p>
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-600">
                      {sale.dueDate || 'Sin fecha'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatPrimary(sale.totalUsd)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-[#558B00]">
                      {formatPrimary(sale.paidUsd)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-amber-700">
                      {formatPrimary(sale.pendingUsd)}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <button
                        type="button"
                        disabled={settlingSaleId === sale.id}
                        onClick={() => void handleMarkPaid(sale)}
                        className="rounded-md bg-[#84CC16] px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-500 whitespace-nowrap cursor-pointer"
                      >
                        Marcar pagado
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900">
                Ventas del período ({filteredData.matchedSales.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">Editable · recálculo automático</span>
          </div>

          {filteredData.matchedSales.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              Sin ventas registradas que coincidan con el filtro actual.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {filteredData.matchedSales.map((sale) => {
                const isConfirmingDelete = confirmDeleteSaleId === sale.id;

                return (
                  <div
                    key={sale.id}
                    className="flex flex-col gap-2 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        <span className="font-mono">{sale.receiptNumber}</span> · {sale.customerName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {sale.branchName} · {sale.saleType === 'cash' ? 'Contado' : 'Crédito'} ·{' '}
                        {new Date(sale.createdAt).toLocaleString('es-VE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2.5 sm:justify-end shrink-0">
                      <div className="text-left sm:text-right font-mono tabular-nums">
                        <p
                          className={`font-bold ${
                            currency === 'VES' ? 'text-[#558B00]' : 'text-slate-900'
                          }`}
                        >
                          {formatPrimary(sale.totalUsd)}
                        </p>
                        <p
                          className={`text-[11px] font-sans font-semibold ${
                            sale.pendingUsd > 0 ? 'text-amber-700' : 'text-[#558B00]'
                          }`}
                        >
                          {sale.pendingUsd > 0 ? `Pend. ${formatUsd(sale.pendingUsd)}` : 'Cobrada'}
                        </p>
                      </div>

                      {isConfirmingDelete ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={deletingSaleId === sale.id}
                            onClick={() => void handleConfirmDeleteSale(sale)}
                            className="rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                          >
                            {deletingSaleId === sale.id ? '...' : 'Eliminar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSaleId(null)}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditSaleModal(sale)}
                            aria-label={`Editar venta ${sale.receiptNumber}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#76B900] hover:text-slate-900 cursor-pointer"
                          >
                            <Pencil className="h-3 w-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSaleId(sale.id)}
                            aria-label={`Eliminar venta ${sale.receiptNumber}`}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Rotación y alertas de stock bajo</h3>
          </div>

          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-2 font-semibold">Producto</th>
                  <th className="py-2 px-2 font-semibold text-right">Vendidas</th>
                  <th className="py-2 pl-2 font-semibold text-right">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockTurnoverRows.map(({ product, stock, soldQty, isLow }) => (
                  <tr key={product.id}>
                    <td className="py-2 pr-2">
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-mono">{product.sku}</span> · {product.category}
                      </p>
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700">
                      {soldQty}
                    </td>
                    <td
                      className={`py-2 pl-2 text-right font-mono font-semibold tabular-nums ${
                        stock <= 0
                          ? 'text-red-600'
                          : isLow
                          ? 'text-amber-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {stock} {stock <= 0 ? '(Agotado)' : isLow ? '(Bajo)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editingSale && editPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Editar venta <span className="font-mono">{editingSale.receiptNumber}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {editingSale.branchName} · {editingSale.customerName} · Tasa Bs{' '}
                  {editPreview.rate.toFixed(2)}/$
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                aria-label="Cerrar editor de venta"
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveEditedSale}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Modalidad</label>
                  <select
                    value={editSaleType}
                    onChange={(e) => {
                      const nextType = e.target.value as SaleType;
                      setEditSaleType(nextType);
                      setEditError('');
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  >
                    <option value="cash">Contado</option>
                    <option value="credit">Crédito</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Pagado / Abonado (USD $)
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditPaidUsdInput(editPreview.totalUsd.toFixed(2))}
                      className="text-[11px] font-semibold text-[#558B00] hover:underline cursor-pointer"
                    >
                      Igualar total
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editPaidUsdInput}
                    onChange={(e) => {
                      setEditPaidUsdInput(e.target.value);
                      setEditError('');
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>

                {editSaleType === 'credit' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Vencimiento crédito
                    </label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex items-end">
                    <p className="text-[11px] text-slate-500">
                      Ajustar cantidades actualiza automáticamente el stock en {editingSale.branchName}.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 border-b border-slate-200">
                  Productos del recibo
                </div>
                <div className="divide-y divide-slate-100">
                  {editItems.map((item, idx) => (
                    <div
                      key={`${item.productId}-${idx}`}
                      className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs"
                    >
                      <div className="col-span-12 sm:col-span-5 min-w-0">
                        <p className="truncate font-semibold text-slate-900">{item.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">{item.sku}</p>
                      </div>
                      <div className="col-span-5 sm:col-span-3">
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantityInput}
                          onChange={(e) =>
                            setEditItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, quantityInput: e.target.value } : row
                              )
                            )
                          }
                          className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-3">
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Precio ($)
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.priceInput}
                          onChange={(e) =>
                            setEditItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, priceInput: e.target.value } : row
                              )
                            )
                          }
                          className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex justify-end pt-3">
                        <button
                          type="button"
                          disabled={editItems.length <= 1}
                          onClick={() =>
                            setEditItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label={`Quitar ${item.name}`}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Notas</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Nota opcional del recibo..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-mono tabular-nums sm:grid-cols-4">
                <div>
                  <p className="font-sans text-[11px] text-slate-500">Subtotal</p>
                  <p className="font-bold text-slate-900">{formatUsd(editPreview.subtotalUsd)}</p>
                </div>
                <div>
                  <p className="font-sans text-[11px] text-slate-500">IVA</p>
                  <p className="font-bold text-slate-900">{formatUsd(editPreview.taxUsd)}</p>
                </div>
                <div>
                  <p className="font-sans text-[11px] text-slate-500">Total venta</p>
                  <p className="font-bold text-slate-900">{formatUsd(editPreview.totalUsd)}</p>
                  <p className="text-[11px] font-semibold text-[#558B00]">
                    {formatVes(editPreview.totalVes)}
                  </p>
                </div>
                <div>
                  <p className="font-sans text-[11px] text-slate-500">
                    {editSaleType === 'credit' ? 'Saldo pendiente' : 'Vuelto'}
                  </p>
                  <p
                    className={`font-bold ${
                      editSaleType === 'credit' && editPreview.pendingUsd > 0
                        ? 'text-amber-700'
                        : 'text-[#558B00]'
                    }`}
                  >
                    {editSaleType === 'credit'
                      ? formatUsd(editPreview.pendingUsd)
                      : formatUsd(editPreview.changeUsd)}
                  </p>
                </div>
              </div>

              {editError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {editError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingSale(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
