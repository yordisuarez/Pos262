import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Search,
  TrendingUp,
} from 'lucide-react';
import type { Branch, CurrencyMode, Product, ReportPeriod, Sale } from '../types/pos';

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
}

export const ReportsManager: React.FC<ReportsManagerProps> = ({
  sales,
  products,
  branches,
  currency,
  exchangeRate,
  onSettleReceivable,
}) => {
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas');
  const [query, setQuery] = useState<string>('');
  const [settlingSaleId, setSettlingSaleId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');

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
          branchFilter === 'all' ? product.minStock * branches.length : product.minStock;
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
            Margen: <span className="font-bold text-slate-800">{filteredData.marginPercent}%</span> · Costo{' '}
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
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <TrendingUp className="h-4 w-4 text-slate-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Ventas del período ({filteredData.matchedSales.length})
            </h3>
          </div>

          {filteredData.matchedSales.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              Sin ventas registradas que coincidan con el filtro actual.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {filteredData.matchedSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-3 py-2 text-xs">
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
                  <div className="text-right font-mono tabular-nums shrink-0">
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
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Rotación y alertas de stock bajo</h3>
          </div>

          <div className="max-h-80 overflow-y-auto">
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
    </div>
  );
};
