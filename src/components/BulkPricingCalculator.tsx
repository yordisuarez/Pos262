import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Search,
} from 'lucide-react';
import type { CurrencyMode, Product } from '../types/pos';

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

interface BulkPricingCalculatorProps {
  products: Product[];
  currency: CurrencyMode;
  exchangeRate: number;
  onUpdateProductPricing: (productId: string, costUsd: number, priceUsd: number) => Promise<void>;
  onBack?: () => void;
}

export const BulkPricingCalculator: React.FC<BulkPricingCalculatorProps> = ({
  products,
  currency,
  exchangeRate,
  onUpdateProductPricing,
  onBack,
}) => {
  const [calcProductId, setCalcProductId] = useState<string>(products[0]?.id || '');
  const [calcProductQuery, setCalcProductQuery] = useState<string>('');
  const [bulkInputCurrency, setBulkInputCurrency] = useState<CurrencyMode>('USD');
  const [bulkCostInput, setBulkCostInput] = useState<string>('24.00');
  const [unitCountInput, setUnitCountInput] = useState<string>('12');
  const [marginPercentInput, setMarginPercentInput] = useState<string>('30');
  const [pricingFormula, setPricingFormula] = useState<'markup' | 'grossMargin'>('markup');
  const [pricingFeedback, setPricingFeedback] = useState<string>('');

  const safeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;

  useEffect(() => {
    if (products.length > 0 && !products.some((p) => p.id === calcProductId)) {
      setCalcProductId(products[0].id);
    }
  }, [products, calcProductId]);

  const handleSelectProduct = (productId: string) => {
    setCalcProductId(productId);
    setPricingFeedback('');
    const target = products.find((p) => p.id === productId);
    if (target && target.costUsd > 0) {
      const displayCost = bulkInputCurrency === 'VES' ? target.costUsd * safeRate : target.costUsd;
      setBulkCostInput(displayCost.toFixed(2));
      setUnitCountInput('1');
    }
  };

  const handleToggleCurrency = (targetCurrency: CurrencyMode) => {
    if (bulkInputCurrency === targetCurrency) return;
    const currentVal = parseFloat(bulkCostInput.replace(',', '.')) || 0;
    const currentUsd = bulkInputCurrency === 'VES' ? currentVal / safeRate : currentVal;
    const nextVal = targetCurrency === 'VES' ? currentUsd * safeRate : currentUsd;
    setBulkInputCurrency(targetCurrency);
    setBulkCostInput(nextVal > 0 ? nextVal.toFixed(2) : '');
  };

  const pricingCalc = useMemo(() => {
    const rawBulk = parseFloat(bulkCostInput.replace(',', '.'));
    const units = parseFloat(unitCountInput.replace(',', '.'));
    const margin = parseFloat(marginPercentInput.replace(',', '.'));

    const validBulk = Number.isFinite(rawBulk) && rawBulk > 0 ? rawBulk : 0;
    const bulkCostUsd =
      bulkInputCurrency === 'VES' ? round2(validBulk / safeRate) : round2(validBulk);
    const validUnits = Number.isFinite(units) && units > 0 ? units : 1;
    const validMargin = Number.isFinite(margin) && margin >= 0 ? margin : 0;

    const unitCostUsd = round2(bulkCostUsd / validUnits);
    let salePriceUsd = unitCostUsd;
    if (pricingFormula === 'markup') {
      salePriceUsd = round2(unitCostUsd * (1 + validMargin / 100));
    } else {
      const clampedMargin = Math.min(95, validMargin);
      salePriceUsd = round2(unitCostUsd / (1 - clampedMargin / 100));
    }

    const profitPerUnitUsd = round2(salePriceUsd - unitCostUsd);
    const totalBulkProfitUsd = round2(profitPerUnitUsd * validUnits);
    const actualGrossMarginPct =
      salePriceUsd > 0 ? round2((profitPerUnitUsd / salePriceUsd) * 100) : 0;

    return {
      bulkCostUsd,
      unitCostUsd,
      unitCostVes: round2(unitCostUsd * safeRate),
      salePriceUsd,
      salePriceVes: round2(salePriceUsd * safeRate),
      profitPerUnitUsd,
      totalBulkProfitUsd,
      actualGrossMarginPct,
    };
  }, [
    bulkCostInput,
    bulkInputCurrency,
    unitCountInput,
    marginPercentInput,
    pricingFormula,
    safeRate,
  ]);

  const handleApplyPricing = async () => {
    if (!calcProductId || pricingCalc.unitCostUsd <= 0 || pricingCalc.salePriceUsd <= 0) return;
    await onUpdateProductPricing(calcProductId, pricingCalc.unitCostUsd, pricingCalc.salePriceUsd);
    const target = products.find((p) => p.id === calcProductId);
    setPricingFeedback(
      `Actualizado "${target?.name ?? ''}": Costo ${formatUsd(
        pricingCalc.unitCostUsd
      )} · Venta ${formatUsd(pricingCalc.salePriceUsd)} (${formatVes(pricingCalc.salePriceVes)}).`
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver
              </button>
            )}
            <Calculator className="h-4 w-4 text-[#76B900]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Calculadora de precios por bulto y margen
              </h2>
              <p className="text-xs text-slate-500">
                Calcula costo unitario y precio de venta al detal y aplícalo directamente al catálogo
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPricingFormula('markup')}
              className={`rounded-md px-2.5 py-1 whitespace-nowrap cursor-pointer ${
                pricingFormula === 'markup'
                  ? 'bg-[#84CC16] text-slate-950'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sobre costo (%)
            </button>
            <button
              type="button"
              onClick={() => setPricingFormula('grossMargin')}
              className={`rounded-md px-2.5 py-1 whitespace-nowrap cursor-pointer ${
                pricingFormula === 'grossMargin'
                  ? 'bg-[#84CC16] text-slate-950'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Margen bruto (%)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="bulk-calc-product-search"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Producto del catálogo
                </label>
                <span className="text-[11px] font-medium tabular-nums text-slate-500">
                  {products.length} {products.length === 1 ? 'producto' : 'productos'}
                </span>
              </div>

              {products.length > 5 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="bulk-calc-product-search"
                    type="search"
                    value={calcProductQuery}
                    onChange={(e) => setCalcProductQuery(e.target.value)}
                    placeholder="Filtrar producto..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>
              )}

              <div
                role="radiogroup"
                aria-label="Producto del catálogo"
                className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white"
              >
                {(() => {
                  const q = calcProductQuery.trim().toLowerCase();
                  const visibleProducts = q
                    ? products.filter(
                        (p) =>
                          p.name.toLowerCase().includes(q) ||
                          p.sku.toLowerCase().includes(q)
                      )
                    : products;

                  if (visibleProducts.length === 0) {
                    return (
                      <p className="px-3 py-3 text-center text-xs text-slate-500">
                        Sin coincidencias en el catálogo.
                      </p>
                    );
                  }

                  return visibleProducts.map((p) => {
                    const isSelected = p.id === calcProductId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handleSelectProduct(p.id)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#F7FEE7]/70'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-[#76B900] bg-[#84CC16]'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-950" />
                            )}
                          </span>
                          <span className="truncate text-sm font-medium text-slate-900">
                            {p.name}
                          </span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-600">
                          C: {formatUsd(p.costUsd)} · V: {formatUsd(p.priceUsd)}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Costo bulto</label>
                  <div className="inline-flex gap-1.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleToggleCurrency('USD')}
                      className={`cursor-pointer ${
                        bulkInputCurrency === 'USD' ? 'text-[#558B00] underline' : 'text-slate-400'
                      }`}
                    >
                      USD
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCurrency('VES')}
                      className={`cursor-pointer ${
                        bulkInputCurrency === 'VES' ? 'text-[#558B00] underline' : 'text-slate-400'
                      }`}
                    >
                      Bs
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bulkCostInput}
                  onChange={(e) => setBulkCostInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Unidades / bulto
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={unitCountInput}
                  onChange={(e) => setUnitCountInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Margen (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="500"
                  value={marginPercentInput}
                  onChange={(e) => setMarginPercentInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {pricingFeedback && (
              <p className="flex items-center gap-1.5 rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] px-3 py-1.5 text-xs font-medium text-[#3F6212]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
                {pricingFeedback}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleApplyPricing()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aplicar precio al POS
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 font-mono tabular-nums lg:col-span-5">
            <div>
              <p className="font-sans text-[11px] font-medium text-slate-500">Costo unitario</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">
                {formatUsd(pricingCalc.unitCostUsd)}
              </p>
              <p className="text-[11px] font-semibold text-[#558B00]">
                {formatVes(pricingCalc.unitCostVes)}
              </p>
            </div>
            <div>
              <p className="font-sans text-[11px] font-medium text-slate-500">
                Precio venta sugerido
              </p>
              <p className="mt-0.5 text-base font-bold text-slate-900">
                {formatUsd(pricingCalc.salePriceUsd)}
              </p>
              <p className="text-[11px] font-semibold text-[#558B00]">
                {formatVes(pricingCalc.salePriceVes)}
              </p>
            </div>
            <div className="border-t border-slate-200 pt-2">
              <p className="font-sans text-[11px] font-medium text-slate-500">Ganancia / unidad</p>
              <p className="mt-0.5 text-xs font-bold text-slate-900">
                {formatUsd(pricingCalc.profitPerUnitUsd)} ({pricingCalc.actualGrossMarginPct}%)
              </p>
            </div>
            <div className="border-t border-slate-200 pt-2">
              <p className="font-sans text-[11px] font-medium text-slate-500">Ganancia por bulto</p>
              <p className="mt-0.5 text-xs font-bold text-[#558B00]">
                {formatUsd(pricingCalc.totalBulkProfitUsd)}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
