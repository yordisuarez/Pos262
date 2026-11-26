import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  Minus,
  Package,
  PackagePlus,
  Plus,
  Search,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import {
  getInventoryValuationSummary,
  type InventoryValuationSummary,
  type StockAlertItem,
  type StockHealthStatus,
} from '../db/posDb';
import type { Branch } from '../types/pos';

type ValuationMode = 'cost' | 'retail';
type StockFilter = 'all' | StockHealthStatus;

const CATEGORY_COLORS = [
  '#76B900',
  '#0F172A',
  '#0284C7',
  '#D97706',
  '#7C3AED',
  '#0D9488',
  '#E11D48',
  '#64748B',
];

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const formatUsd = (amount: number): string =>
  `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatCompactUsd = (amount: number): string => {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 10_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const formatVes = (amount: number): string =>
  `Bs ${amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

interface InventoryValuationPanelProps {
  branches: Branch[];
  activeBranchId: string;
  exchangeRate: number;
  isBranchLocked?: boolean;
  canEditInventory?: boolean;
  refreshKey?: string | number;
  onQuickRestock?: (productId: string, branchId: string, suggestedQty: number) => void;
  onCreateProduct?: () => void;
  onOpenLoadStock?: () => void;
  onOpenTransferStock?: () => void;
}

export const InventoryValuationPanel: React.FC<InventoryValuationPanelProps> = ({
  branches,
  activeBranchId,
  exchangeRate,
  isBranchLocked = false,
  canEditInventory = true,
  refreshKey,
  onQuickRestock,
  onCreateProduct,
  onOpenLoadStock,
  onOpenTransferStock,
}) => {
  const operationalBranches = useMemo(() => {
    const active = branches.filter((b) => b.isActive);
    const pool = active.length > 0 ? active : branches;
    if (isBranchLocked) {
      const assigned = pool.filter((b) => b.id === activeBranchId);
      return assigned.length > 0 ? assigned : pool.slice(0, 1);
    }
    return pool;
  }, [branches, isBranchLocked, activeBranchId]);

  const [selectedBranchScope, setSelectedBranchScope] = useState<string>(
    activeBranchId || 'all'
  );
  const [valuationMode, setValuationMode] = useState<ValuationMode>('retail');
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredHistoryIdx, setHoveredHistoryIdx] = useState<number | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [showAllAlerts, setShowAllAlerts] = useState<boolean>(false);

  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [detailSearch, setDetailSearch] = useState<string>('');
  const [detailCategory, setDetailCategory] = useState<string>('Todas');

  const [summary, setSummary] = useState<InventoryValuationSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isBranchLocked) {
      setSelectedBranchScope(activeBranchId);
      return;
    }
    if (
      selectedBranchScope !== 'all' &&
      !operationalBranches.some((b) => b.id === selectedBranchScope)
    ) {
      setSelectedBranchScope(activeBranchId || operationalBranches[0]?.id || 'all');
    }
  }, [isBranchLocked, activeBranchId, operationalBranches, selectedBranchScope]);

  const effectiveBranchScope = isBranchLocked ? activeBranchId : selectedBranchScope;

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      try {
        setError(null);
        const result = await getInventoryValuationSummary({
          branchId: effectiveBranchScope,
          exchangeRate,
          historyDays: 30,
        });
        if (!active) return;
        setSummary(result);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo calcular el resumen financiero del inventario.'
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSummary();
    return () => {
      active = false;
    };
  }, [effectiveBranchScope, exchangeRate, refreshKey]);

  // Donut chart segments
  const categorySlices = useMemo(() => {
    if (!summary) return [];
    const total = valuationMode === 'cost' ? summary.totalCostUsd : summary.totalRetailUsd;
    const sorted = [...summary.categories]
      .map((cat, idx) => {
        const valueUsd = valuationMode === 'cost' ? cat.costValueUsd : cat.retailValueUsd;
        const valueVes = valuationMode === 'cost' ? cat.costValueVes : cat.retailValueVes;
        const percentage =
          valuationMode === 'cost' ? cat.costPercentage : cat.retailPercentage;
        return {
          ...cat,
          valueUsd,
          valueVes,
          percentage: total > 0 ? percentage : 0,
          color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
        };
      })
      .sort((a, b) => b.valueUsd - a.valueUsd);

    const radius = 64;
    const circumference = 2 * Math.PI * radius;
    let cumulativeFraction = 0;

    return sorted.map((slice) => {
      const fraction = total > 0 ? slice.valueUsd / total : 0;
      const dashLength = Math.max(0, fraction * circumference);
      const dashOffset = -cumulativeFraction * circumference;
      cumulativeFraction += fraction;
      return {
        ...slice,
        fraction,
        dashLength,
        dashOffset,
        circumference,
      };
    });
  }, [summary, valuationMode]);

  const activeDonutSlice = useMemo(() => {
    if (!hoveredCategory) return null;
    return categorySlices.find((s) => s.category === hoveredCategory) ?? null;
  }, [categorySlices, hoveredCategory]);

  // Historical line chart geometry
  const historyChart = useMemo(() => {
    const points = summary?.history ?? [];
    const width = 480;
    const height = 180;
    const padLeft = 56;
    const padRight = 14;
    const padTop = 18;
    const padBottom = 28;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    if (points.length === 0) {
      return {
        width,
        height,
        padLeft,
        padRight,
        padTop,
        padBottom,
        plotW,
        plotH,
        coords: [] as Array<{
          x: number;
          y: number;
          valueUsd: number;
          valueVes: number;
          label: string;
          dateKey: string;
        }>,
        linePath: '',
        areaPath: '',
        yTicks: [] as Array<{ y: number; value: number }>,
        xTicks: [] as Array<{ x: number; label: string; anchor: 'start' | 'middle' | 'end' }>,
      };
    }

    const values = points.map((p) =>
      valuationMode === 'cost' ? p.costValueUsd : p.retailValueUsd
    );
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);

    let minVal: number;
    let maxVal: number;
    if (rawMax === rawMin) {
      if (rawMax === 0) {
        minVal = 0;
        maxVal = 100;
      } else {
        minVal = Math.max(0, rawMin * 0.85);
        maxVal = rawMax * 1.15;
      }
    } else {
      const spread = rawMax - rawMin;
      minVal = Math.max(0, rawMin - spread * 0.18);
      maxVal = rawMax + spread * 0.14;
    }
    const range = Math.max(1, maxVal - minVal);

    const coords = points.map((point, index) => {
      const valueUsd = valuationMode === 'cost' ? point.costValueUsd : point.retailValueUsd;
      const valueVes = valuationMode === 'cost' ? point.costValueVes : point.retailValueVes;
      const x =
        points.length > 1
          ? padLeft + (index / (points.length - 1)) * plotW
          : padLeft + plotW / 2;
      const y = padTop + plotH - ((valueUsd - minVal) / range) * plotH;
      return {
        x,
        y,
        valueUsd,
        valueVes,
        label: point.label,
        dateKey: point.dateKey,
      };
    });

    const linePath = coords
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');

    const baselineY = padTop + plotH;
    const areaPath =
      coords.length > 0
        ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`
        : '';

    const yTicks = [0, 0.5, 1].map((t) => ({
      y: padTop + plotH * (1 - t),
      value: minVal + range * t,
    }));

    const tickIndices =
      coords.length >= 4
        ? [0, Math.floor((coords.length - 1) / 3), Math.floor(((coords.length - 1) * 2) / 3), coords.length - 1]
        : coords.map((_, i) => i);

    const xTicks = Array.from(new Set(tickIndices)).map((idx, pos, arr) => ({
      x: coords[idx].x,
      label: coords[idx].label,
      anchor: (pos === 0 ? 'start' : pos === arr.length - 1 ? 'end' : 'middle') as
        | 'start'
        | 'middle'
        | 'end',
    }));

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      coords,
      linePath,
      areaPath,
      yTicks,
      xTicks,
    };
  }, [summary, valuationMode]);

  const activeHistoryPoint =
    hoveredHistoryIdx !== null && historyChart.coords[hoveredHistoryIdx]
      ? historyChart.coords[hoveredHistoryIdx]
      : null;

  const filteredAlerts = useMemo(() => {
    if (!summary) return [];
    if (stockFilter === 'all') return summary.hotLowStockItems;
    return summary.hotLowStockItems.filter((item) => item.status === stockFilter);
  }, [summary, stockFilter]);

  const visibleAlerts = useMemo(
    () => (showAllAlerts ? filteredAlerts : filteredAlerts.slice(0, 8)),
    [filteredAlerts, showAllAlerts]
  );

  const detailCategories = useMemo(() => {
    if (!summary) return ['Todas'];
    return ['Todas', ...summary.categories.map((c) => c.category)];
  }, [summary]);

  const filteredDetailItems = useMemo(() => {
    if (!summary) return [];
    const q = detailSearch.trim().toLowerCase();
    return summary.items.filter((item) => {
      const matchesCat = detailCategory === 'Todas' || item.category === detailCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [summary, detailSearch, detailCategory]);

  const filteredDetailTotals = useMemo(() => {
    let units = 0;
    let costUsd = 0;
    let retailUsd = 0;
    for (const item of filteredDetailItems) {
      units += item.currentStock;
      costUsd = round2(costUsd + item.costValueUsd);
      retailUsd = round2(retailUsd + item.retailValueUsd);
    }
    const profitUsd = round2(retailUsd - costUsd);
    return { units, costUsd, retailUsd, profitUsd };
  }, [filteredDetailItems]);

  const handleRestockClick = (item: StockAlertItem) => {
    if (!onQuickRestock) return;
    const targetBranch =
      effectiveBranchScope !== 'all'
        ? effectiveBranchScope
        : activeBranchId || operationalBranches[0]?.id || '';
    if (!targetBranch) return;
    onQuickRestock(item.productId, targetBranch, Math.max(1, item.suggestedRestockQty || 10));
  };

  if (loading && !summary) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Cargando resumen financiero">
        <div className="h-7 w-72 rounded-lg bg-slate-200/70" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="h-36 rounded-xl border border-slate-200 bg-white p-5 space-y-3"
            >
              <div className="h-3.5 w-32 rounded bg-slate-200/70" />
              <div className="h-7 w-40 rounded bg-slate-200/80" />
              <div className="h-3 w-48 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-72 rounded-xl border border-slate-200 bg-white p-5" />
          <div className="h-72 rounded-xl border border-slate-200 bg-white p-5" />
        </div>
      </section>
    );
  }

  if (error || !summary) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
        {error || 'No hay datos disponibles para mostrar el resumen financiero.'}
      </section>
    );
  }

  const activeTotalUsd =
    valuationMode === 'cost' ? summary.totalCostUsd : summary.totalRetailUsd;
  const activeTotalVes =
    valuationMode === 'cost' ? summary.totalCostVes : summary.totalRetailVes;
  const activeVariation =
    valuationMode === 'cost' ? summary.costVariationPercent : summary.retailVariationPercent;

  return (
    <section className="space-y-4" aria-label="Resumen Financiero y Valor de Inventario">
      {/* Header strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
            Resumen Financiero y Valor de Inventario
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{summary.branchName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Tasa activa: Bs {summary.exchangeRate.toFixed(2)} / $
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isBranchLocked && operationalBranches.length > 1 && (
            <div className="flex items-center gap-2 shrink-0">
              <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                aria-label="Filtrar valorización por sucursal"
                value={selectedBranchScope}
                onChange={(e) => setSelectedBranchScope(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#76B900] focus:outline-none cursor-pointer"
              >
                <option value="all">Todas las sucursales</option>
                {operationalBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </div>
          )}

        </div>
      </div>

      {/* 1. TARJETAS KPI SUPERIORES */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Card 1: Valor por costo */}
        <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">Valor por costo</p>
              <Wallet className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums sm:text-[26px]">
              {formatUsd(summary.totalCostUsd)}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold text-slate-500 tabular-nums">
              {formatVes(summary.totalCostVes)}
            </p>
          </div>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Suma del costo acumulado de tus ítems
          </p>
        </article>

        {/* Card 2: Valor por precio de venta */}
        <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">Valor por precio de venta</p>
              <TrendingUp className="h-4 w-4 text-[#76B900] shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums sm:text-[26px]">
              {formatUsd(summary.totalRetailUsd)}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="font-mono font-semibold tabular-nums">
                {formatVes(summary.totalRetailVes)}
              </span>
              {summary.totalRetailUsd > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-[#558B00] tabular-nums">
                    Margen {summary.potentialMarginPercent.toFixed(1)}%
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              Cuánto facturarías si vendieras todo el inventario
            </p>
            <button
              type="button"
              onClick={() => setDetailModalOpen(true)}
              className="inline-flex items-center gap-0.5 text-xs font-bold text-[#558B00] hover:text-[#3F6212] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:underline"
            >
              <span>Ver detalle</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </article>

        {/* Card 3: Productos en inventario */}
        <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">Productos en inventario</p>
              <Package className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums sm:text-[26px]">
              {summary.activeProductsCount.toLocaleString('es-VE')}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-600 tabular-nums">
                {summary.totalUnitsInStock.toLocaleString('es-VE')} uds
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {summary.productsWithStockCount} con stock disponible
              </span>
            </p>
          </div>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Ítems activos en tu comercio
          </p>
        </article>
      </div>

      {/* 2. DESGLOSE POR CATEGORÍA Y EVOLUCIÓN HISTÓRICA */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Donut chart by category */}
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-2.5 border-b border-slate-100 pb-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Valor de inventario por categoría
              </h2>
              <p className="text-xs text-slate-500">
                Participación acumulada en USD según stock actual
              </p>
            </div>

            <div
              role="group"
              aria-label="Tipo de valorización por categoría"
              className="inline-flex items-center rounded-lg bg-slate-100 p-1 self-start sm:self-auto shrink-0"
            >
              <button
                type="button"
                onClick={() => setValuationMode('cost')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  valuationMode === 'cost'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por costo
              </button>
              <button
                type="button"
                onClick={() => setValuationMode('retail')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  valuationMode === 'retail'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por precio de venta
              </button>
            </div>
          </div>

          {categorySlices.length === 0 || activeTotalUsd <= 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <p className="text-xs font-semibold text-slate-700">
                Sin existencias valorizadas para graficar
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Carga stock a tus productos para visualizar la distribución por categoría.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-1 flex-col items-center gap-5 sm:flex-row sm:items-center">
              {/* Interactive SVG Donut */}
              <div className="relative h-44 w-44 shrink-0">
                <svg
                  viewBox="0 0 180 180"
                  className="h-full w-full -rotate-90"
                  role="img"
                  aria-label="Gráfico de dona de valor de inventario por categoría"
                >
                  <circle
                    cx="90"
                    cy="90"
                    r="64"
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="22"
                  />
                  {categorySlices.map((slice) => {
                    if (slice.dashLength <= 0) return null;
                    const isDimmed =
                      hoveredCategory !== null && hoveredCategory !== slice.category;
                    const isHighlighted = hoveredCategory === slice.category;
                    return (
                      <circle
                        key={slice.category}
                        cx="90"
                        cy="90"
                        r="64"
                        fill="none"
                        stroke={slice.color}
                        strokeWidth={isHighlighted ? 25 : 22}
                        strokeDasharray={`${Math.max(0, slice.dashLength - 1.5)} ${slice.circumference}`}
                        strokeDashoffset={slice.dashOffset}
                        className="transition-opacity duration-150 cursor-pointer"
                        style={{ opacity: isDimmed ? 0.3 : 1 }}
                        onMouseEnter={() => setHoveredCategory(slice.category)}
                        onMouseLeave={() => setHoveredCategory(null)}
                      >
                        <title>
                          {slice.category}: {formatUsd(slice.valueUsd)} (
                          {slice.percentage.toFixed(1)}%)
                        </title>
                      </circle>
                    );
                  })}
                </svg>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
                  <span className="max-w-[104px] truncate text-[11px] font-semibold text-slate-500">
                    {activeDonutSlice
                      ? activeDonutSlice.category
                      : valuationMode === 'cost'
                      ? 'Total costo'
                      : 'Total venta'}
                  </span>
                  <span className="mt-0.5 font-mono text-sm font-extrabold text-slate-900 tabular-nums">
                    {formatUsd(activeDonutSlice ? activeDonutSlice.valueUsd : activeTotalUsd)}
                  </span>
                  <span className="mt-0.5 font-mono text-[11px] font-semibold text-[#558B00] tabular-nums">
                    {activeDonutSlice
                      ? `${activeDonutSlice.percentage.toFixed(1)}%`
                      : `${categorySlices.length} cat.`}
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className="w-full flex-1 min-w-0 divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
                {categorySlices.map((slice) => {
                  const isHighlighted = hoveredCategory === slice.category;
                  return (
                    <div
                      key={slice.category}
                      onMouseEnter={() => setHoveredCategory(slice.category)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      className={`flex items-center justify-between gap-3 py-2 px-1.5 rounded-md transition-colors cursor-default ${
                        isHighlighted ? 'bg-slate-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: slice.color }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {slice.category}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                            {slice.totalUnits.toLocaleString('es-VE')} uds · {slice.productCount}{' '}
                            {slice.productCount === 1 ? 'ítem' : 'ítems'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                          {formatUsd(slice.valueUsd)}
                        </p>
                        <p className="font-mono text-[11px] font-medium text-slate-500 tabular-nums">
                          {slice.percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </article>

        {/* Right: Historical valuation line chart (last 30 days) */}
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-3.5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Valor histórico (último mes)</h2>
              <p className="text-xs text-slate-500">
                Evolución diaria · {valuationMode === 'cost' ? 'Base costo' : 'Base precio de venta'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0">
              {activeVariation > 0 ? (
                <span className="inline-flex items-center gap-0.5 font-mono text-emerald-700 tabular-nums">
                  <ArrowUpRight className="h-3.5 w-3.5" />+{activeVariation.toFixed(1)}%
                </span>
              ) : activeVariation < 0 ? (
                <span className="inline-flex items-center gap-0.5 font-mono text-red-600 tabular-nums">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  {activeVariation.toFixed(1)}%
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 font-mono text-slate-500 tabular-nums">
                  <Minus className="h-3.5 w-3.5" />
                  0.0%
                </span>
              )}
              <span className="font-normal text-slate-400">vs. hace 30 días</span>
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xl font-extrabold text-slate-900 tabular-nums">
                {formatUsd(activeHistoryPoint ? activeHistoryPoint.valueUsd : activeTotalUsd)}
              </span>
              <span className="font-mono text-xs font-medium text-slate-500 tabular-nums">
                {formatVes(activeHistoryPoint ? activeHistoryPoint.valueVes : activeTotalVes)}
              </span>
            </div>
            <span className="font-mono text-[11px] font-medium text-slate-500 tabular-nums">
              {activeHistoryPoint ? `Fecha: ${activeHistoryPoint.label}` : 'Valor actual'}
            </span>
          </div>

          <div className="mt-3 flex-1">
            <svg
              viewBox={`0 0 ${historyChart.width} ${historyChart.height}`}
              className="h-44 w-full overflow-visible"
              role="img"
              aria-label="Gráfico de línea del valor histórico del inventario en los últimos 30 días"
              onMouseLeave={() => setHoveredHistoryIdx(null)}
            >
              <defs>
                <linearGradient id="inventoryHistoryGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#84CC16" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#84CC16" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Horizontal gridlines + Y labels */}
              {historyChart.yTicks.map((tick, idx) => (
                <g key={idx}>
                  <line
                    x1={historyChart.padLeft}
                    x2={historyChart.width - historyChart.padRight}
                    y1={tick.y}
                    y2={tick.y}
                    stroke="#E2E8F0"
                    strokeDasharray={idx === 0 ? undefined : '3 3'}
                    strokeWidth="1"
                  />
                  <text
                    x={historyChart.padLeft - 8}
                    y={tick.y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 font-mono text-[10px]"
                  >
                    {formatCompactUsd(tick.value)}
                  </text>
                </g>
              ))}

              {/* Area + Line */}
              {historyChart.areaPath && (
                <path d={historyChart.areaPath} fill="url(#inventoryHistoryGradient)" />
              )}
              {historyChart.linePath && (
                <path
                  d={historyChart.linePath}
                  fill="none"
                  stroke="#65A30D"
                  strokeWidth="2.25"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Hover crosshair + active point */}
              {activeHistoryPoint && (
                <g>
                  <line
                    x1={activeHistoryPoint.x}
                    x2={activeHistoryPoint.x}
                    y1={historyChart.padTop}
                    y2={historyChart.padTop + historyChart.plotH}
                    stroke="#94A3B8"
                    strokeDasharray="2 2"
                    strokeWidth="1"
                  />
                  <circle
                    cx={activeHistoryPoint.x}
                    cy={activeHistoryPoint.y}
                    r="4.5"
                    fill="#84CC16"
                    stroke="#0F172A"
                    strokeWidth="1.75"
                  />
                </g>
              )}

              {/* Latest endpoint dot when not hovering */}
              {!activeHistoryPoint && historyChart.coords.length > 0 && (
                <circle
                  cx={historyChart.coords[historyChart.coords.length - 1].x}
                  cy={historyChart.coords[historyChart.coords.length - 1].y}
                  r="3.5"
                  fill="#65A30D"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              )}

              {/* X-axis date ticks */}
              {historyChart.xTicks.map((tick, idx) => (
                <text
                  key={idx}
                  x={tick.x}
                  y={historyChart.height - 6}
                  textAnchor={tick.anchor}
                  className="fill-slate-400 font-mono text-[10px]"
                >
                  {tick.label}
                </text>
              ))}

              {/* Invisible interactive hit bands for each day */}
              {historyChart.coords.map((pt, idx) => {
                const bandW =
                  historyChart.coords.length > 1
                    ? historyChart.plotW / (historyChart.coords.length - 1)
                    : historyChart.plotW;
                return (
                  <rect
                    key={pt.dateKey}
                    x={Math.max(historyChart.padLeft, pt.x - bandW / 2)}
                    y={historyChart.padTop}
                    width={bandW}
                    height={historyChart.plotH}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoveredHistoryIdx(idx)}
                  >
                    <title>
                      {pt.label}: {formatUsd(pt.valueUsd)} ({formatVes(pt.valueVes)})
                    </title>
                  </rect>
                );
              })}
            </svg>

            <p className="mt-1 text-[11px] text-slate-400">
              {summary.hasHistoricalMovements
                ? 'Calculado en tiempo real con base en ventas, cargas de stock y traslados del período.'
                : 'Sin movimientos registrados en los últimos 30 días; la curva refleja el valor base actual.'}
            </p>
          </div>
        </article>
      </div>

      {/* 3. ALERTAS DE REABASTECIMIENTO */}
      <article className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2.5">
            <Flame className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-sm font-bold text-slate-900">
                  Productos hot · bajos en stock
                </h2>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-xs font-semibold text-red-700">Prioridad alta</span>
              </div>
              <p className="text-xs text-slate-500">
                Ítems ordenados por nivel crítico de inventario y rotación de los últimos 30 días
              </p>
            </div>
          </div>

          {/* Interactive status filter counters */}
          <div
            role="group"
            aria-label="Filtrar productos por estado de stock"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => {
                setStockFilter('all');
                setShowAllAlerts(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                stockFilter === 'all'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Todos</span>
              <span className="font-mono tabular-nums opacity-80">
                {summary.activeProductsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStockFilter('critical');
                setShowAllAlerts(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                stockFilter === 'critical'
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-red-200 bg-red-50/70 text-red-700 hover:bg-red-50'
              }`}
            >
              <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
              <span>Críticos</span>
              <span className="font-mono tabular-nums">{summary.stockCounts.critical}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStockFilter('warning');
                setShowAllAlerts(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                stockFilter === 'warning'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-amber-200 bg-amber-50/70 text-amber-800 hover:bg-amber-50'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Atención</span>
              <span className="font-mono tabular-nums">{summary.stockCounts.warning}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStockFilter('ok');
                setShowAllAlerts(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                stockFilter === 'ok'
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-50'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>OK</span>
              <span className="font-mono tabular-nums">{summary.stockCounts.ok}</span>
            </button>
          </div>
        </div>

        {visibleAlerts.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs font-semibold text-slate-700">
              No hay productos en la clasificación seleccionada.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Selecciona otro estado arriba para revisar el resto del inventario.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-semibold">Producto</th>
                    <th className="py-2 px-3 font-semibold whitespace-nowrap">Estado</th>
                    <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                      Stock / Mínimo
                    </th>
                    <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                      Vendidos (30d)
                    </th>
                    <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                      Inversión reposición
                    </th>
                    {canEditInventory && onQuickRestock && (
                      <th className="py-2 pl-3 font-semibold text-right whitespace-nowrap">
                        Acción
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleAlerts.map((item) => {
                    const fillRatio =
                      item.minStock > 0
                        ? Math.min(100, Math.round((item.currentStock / (item.minStock * 1.5)) * 100))
                        : item.currentStock > 0
                        ? 100
                        : 0;

                    return (
                      <tr key={item.productId} className="hover:bg-slate-50/70">
                        <td className="py-2.5 pr-4">
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-[11px] text-slate-500">
                            <span className="font-mono">{item.sku}</span> · {item.category} · Costo{' '}
                            <span className="font-mono tabular-nums">
                              {formatUsd(item.costUsd)}
                            </span>
                          </p>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {item.status === 'critical' ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                              <AlertOctagon className="h-3 w-3 shrink-0" />
                              Crítico
                            </span>
                          ) : item.status === 'warning' ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              Atención
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                              OK
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex flex-col items-end gap-1">
                            <span className="font-mono font-bold tabular-nums text-slate-900">
                              {item.currentStock}{' '}
                              <span className="font-normal text-slate-400">
                                / {item.minStock} {item.unit}
                              </span>
                            </span>
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${
                                  item.status === 'critical'
                                    ? 'bg-red-500'
                                    : item.status === 'warning'
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.max(item.currentStock > 0 ? 8 : 0, fillRatio)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-slate-700 whitespace-nowrap">
                          {item.soldLast30Days} {item.unit}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {item.suggestedRestockQty > 0 ? (
                            <div>
                              <p className="font-mono font-bold text-slate-900 tabular-nums">
                                {formatUsd(item.estimatedRestockCostUsd)}
                              </p>
                              <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                                +{item.suggestedRestockQty} {item.unit} sugeridas
                              </p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Cubierto</span>
                          )}
                        </td>

                        {canEditInventory && onQuickRestock && (
                          <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleRestockClick(item)}
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                                item.status === 'critical' || item.status === 'warning'
                                  ? 'bg-[#84CC16] text-slate-950 hover:bg-[#76B900]'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <PackagePlus className="h-3 w-3" />
                              Reponer
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredAlerts.length > 8 && (
              <div className="flex justify-center border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAllAlerts((prev) => !prev)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  {showAllAlerts
                    ? 'Mostrar menos'
                    : `Ver todos los productos (${filteredAlerts.length})`}
                </button>
              </div>
            )}
          </>
        )}
      </article>

      {/* Modal: Detalle de Valorización de Inventario ("Ver detalle >") */}
      {detailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="valuation-detail-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 id="valuation-detail-title" className="text-sm font-bold text-slate-900">
                  Detalle de valorización por producto
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {summary.branchName} · Tasa Bs {summary.exchangeRate.toFixed(2)} / $ · Utilidad
                  bruta potencial:{' '}
                  <span className="font-mono font-bold text-[#558B00] tabular-nums">
                    {formatUsd(summary.potentialProfitUsd)} ({summary.potentialMarginPercent.toFixed(1)}
                    %)
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                aria-label="Cerrar detalle de valorización"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 border-b border-slate-100 bg-slate-50/70 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={detailSearch}
                    onChange={(e) => setDetailSearch(e.target.value)}
                    placeholder="Buscar producto o SKU..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                  />
                </div>
                <select
                  aria-label="Filtrar detalle por categoría"
                  value={detailCategory}
                  onChange={(e) => setDetailCategory(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-[#76B900] focus:outline-none"
                >
                  {detailCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'Todas' ? 'Todas las categorías' : cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-slate-500">
                  Costo:{' '}
                  <strong className="font-mono text-slate-900 tabular-nums">
                    {formatUsd(filteredDetailTotals.costUsd)}
                  </strong>
                </span>
                <span className="text-slate-500">
                  Venta:{' '}
                  <strong className="font-mono text-slate-900 tabular-nums">
                    {formatUsd(filteredDetailTotals.retailUsd)}
                  </strong>
                </span>
                <span className="text-slate-500">
                  Ganancia est.:{' '}
                  <strong className="font-mono text-[#558B00] tabular-nums">
                    {formatUsd(filteredDetailTotals.profitUsd)}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-5 py-3">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-semibold">Producto</th>
                    <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Stock</th>
                    <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                      Costo unit.
                    </th>
                    <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                      Precio venta
                    </th>
                    <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                      Valor costo
                    </th>
                    <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                      Valor venta
                    </th>
                    <th className="py-2 pl-3 font-semibold text-right whitespace-nowrap">Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDetailItems.map((item) => (
                    <tr key={item.productId} className="hover:bg-slate-50/70">
                      <td className="py-2 pr-4">
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="text-[11px] text-slate-500">
                          <span className="font-mono">{item.sku}</span> · {item.category}
                        </p>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-slate-800 whitespace-nowrap">
                        {item.currentStock} {item.unit}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatUsd(item.costUsd)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {formatUsd(item.priceUsd)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-slate-700 whitespace-nowrap">
                        <p>{formatUsd(item.costValueUsd)}</p>
                        <p className="text-[10px] font-normal text-slate-400">
                          {formatVes(round2(item.costValueUsd * summary.exchangeRate))}
                        </p>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                        <p>{formatUsd(item.retailValueUsd)}</p>
                        <p className="text-[10px] font-normal text-slate-400">
                          {formatVes(round2(item.retailValueUsd * summary.exchangeRate))}
                        </p>
                      </td>
                      <td className="py-2 pl-3 text-right font-mono font-semibold tabular-nums text-[#558B00] whitespace-nowrap">
                        {item.marginPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  {filteredDetailItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                        No se encontraron productos con ese criterio.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs">
              <span className="text-slate-500">
                {filteredDetailItems.length} productos ·{' '}
                <span className="font-mono tabular-nums">
                  {filteredDetailTotals.units.toLocaleString('es-VE')} uds
                </span>
              </span>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
