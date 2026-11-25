import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Check,
  CheckCircle2,
  Pencil,
  Plus,
  Receipt,
  Scale,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import type {
  Branch,
  Cashier,
  CurrencyMode,
  Expense,
  ExpenseType,
  Product,
  Sale,
  SupplierQuote,
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

interface CostingManagerProps {
  products: Product[];
  branches: Branch[];
  activeBranchId: string;
  activeCashier: Cashier;
  supplierQuotes: SupplierQuote[];
  expenses: Expense[];
  sales: Sale[];
  currency: CurrencyMode;
  exchangeRate: number;
  isBranchLocked?: boolean;
  onUpdateProductPricing: (productId: string, costUsd: number, priceUsd: number) => Promise<void>;
  onAddSupplierQuote: (params: {
    supplierName: string;
    supplierPhone?: string;
    productId: string;
    bulkCostUsd: number;
    unitsPerBulk: number;
    notes?: string;
  }) => Promise<void>;
  onDeleteSupplierQuote: (quoteId: string) => Promise<void>;
  onAddExpense: (params: {
    branchId: string;
    type: ExpenseType;
    category: string;
    description: string;
    amountUsd: number;
    expenseDate: string;
    notes?: string;
  }) => Promise<void>;
  onUpdateExpense: (params: {
    id: string;
    branchId: string;
    type: ExpenseType;
    category: string;
    description: string;
    amountUsd: number;
    expenseDate: string;
  }) => Promise<void>;
  onDeleteExpense: (expenseId: string) => Promise<void>;
}

export const CostingManager: React.FC<CostingManagerProps> = ({
  products,
  branches,
  activeBranchId,
  activeCashier,
  supplierQuotes,
  expenses,
  sales,
  currency,
  exchangeRate,
  isBranchLocked = false,
  onUpdateProductPricing,
  onAddSupplierQuote,
  onDeleteSupplierQuote,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
}) => {
  const [calcProductId, setCalcProductId] = useState<string>(products[0]?.id || '');
  const [calcProductQuery, setCalcProductQuery] = useState<string>('');
  const [bulkInputCurrency, setBulkInputCurrency] = useState<CurrencyMode>('USD');
  const [bulkCostInput, setBulkCostInput] = useState<string>('24.00');
  const [unitCountInput, setUnitCountInput] = useState<string>('12');
  const [marginPercentInput, setMarginPercentInput] = useState<string>('30');
  const [pricingFormula, setPricingFormula] = useState<'markup' | 'grossMargin'>('markup');
  const [pricingFeedback, setPricingFeedback] = useState<string>('');

  const [compareProductId, setCompareProductId] = useState<string>(products[0]?.id || '');
  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierPhone, setSupplierPhone] = useState<string>('');
  const [quoteBulkCostInput, setQuoteBulkCostInput] = useState<string>('');
  const [quoteUnitsInput, setQuoteUnitsInput] = useState<string>('12');
  const [quoteNotes, setQuoteNotes] = useState<string>('');
  const [supplierFeedback, setSupplierFeedback] = useState<string>('');

  const [expenseBranchId, setExpenseBranchId] = useState<string>(activeBranchId);
  const [expenseType, setExpenseType] = useState<ExpenseType>('fixed');
  const [expenseCategory, setExpenseCategory] = useState<string>('Operativo');
  const [expenseDescription, setExpenseDescription] = useState<string>('');
  const [expenseCurrency, setExpenseCurrency] = useState<CurrencyMode>('USD');
  const [expenseAmountInput, setExpenseAmountInput] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [expenseFeedback, setExpenseFeedback] = useState<string>('');

  // Inline expense editing & deletion state
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editExpType, setEditExpType] = useState<ExpenseType>('fixed');
  const [editExpBranchId, setEditExpBranchId] = useState<string>(activeBranchId);
  const [editExpCategory, setEditExpCategory] = useState<string>('');
  const [editExpDescription, setEditExpDescription] = useState<string>('');
  const [editExpCurrency, setEditExpCurrency] = useState<CurrencyMode>('USD');
  const [editExpAmount, setEditExpAmount] = useState<string>('');
  const [editExpDate, setEditExpDate] = useState<string>('');
  const [savingExpenseEdit, setSavingExpenseEdit] = useState<boolean>(false);
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<string | null>(null);

  useEffect(() => {
    if (products.length > 0) {
      if (!products.some((p) => p.id === calcProductId)) setCalcProductId(products[0].id);
      if (!products.some((p) => p.id === compareProductId)) setCompareProductId(products[0].id);
    }
  }, [products, calcProductId, compareProductId]);

  useEffect(() => {
    if (isBranchLocked) {
      setExpenseBranchId(activeBranchId);
      setEditExpBranchId(activeBranchId);
      return;
    }
    if (branches.length > 0 && !branches.some((b) => b.id === expenseBranchId)) {
      setExpenseBranchId(branches[0].id);
    }
  }, [branches, expenseBranchId, isBranchLocked, activeBranchId]);

  const selectableBranches = useMemo(() => {
    if (!isBranchLocked) return branches;
    const assigned = branches.filter((b) => b.id === activeBranchId);
    return assigned.length > 0 ? assigned : branches.slice(0, 1);
  }, [branches, isBranchLocked, activeBranchId]);

  const formatPrimary = (usd: number): string =>
    currency === 'USD' ? formatUsd(usd) : formatVes(round2(usd * exchangeRate));

  const pricingCalc = useMemo(() => {
    const rawBulk = parseFloat(bulkCostInput.replace(',', '.'));
    const units = parseFloat(unitCountInput.replace(',', '.'));
    const margin = parseFloat(marginPercentInput.replace(',', '.'));

    const validBulk = Number.isFinite(rawBulk) && rawBulk > 0 ? rawBulk : 0;
    const bulkCostUsd =
      bulkInputCurrency === 'VES' ? round2(validBulk / exchangeRate) : round2(validBulk);
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
      unitCostVes: round2(unitCostUsd * exchangeRate),
      salePriceUsd,
      salePriceVes: round2(salePriceUsd * exchangeRate),
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
    exchangeRate,
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

  const quotesForSelectedProduct = useMemo(() => {
    return supplierQuotes
      .filter((q) => q.productId === compareProductId)
      .sort((a, b) => a.unitCostUsd - b.unitCostUsd);
  }, [supplierQuotes, compareProductId]);

  const handleCreateSupplierQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupplierFeedback('');
    const bulk = parseFloat(quoteBulkCostInput.replace(',', '.'));
    const units = parseInt(quoteUnitsInput, 10);
    if (
      !supplierName.trim() ||
      !compareProductId ||
      !Number.isFinite(bulk) ||
      bulk <= 0 ||
      !Number.isFinite(units) ||
      units <= 0
    ) {
      return;
    }

    await onAddSupplierQuote({
      supplierName: supplierName.trim(),
      supplierPhone: supplierPhone.trim() || undefined,
      productId: compareProductId,
      bulkCostUsd: round2(bulk),
      unitsPerBulk: units,
      notes: quoteNotes.trim() || undefined,
    });

    setSupplierName('');
    setSupplierPhone('');
    setQuoteBulkCostInput('');
    setQuoteNotes('');
    setSupplierFeedback('Cotización de proveedor guardada en IndexedDB.');
  };

  const handleUseQuoteInCalculator = (quote: SupplierQuote) => {
    setCalcProductId(quote.productId);
    setBulkInputCurrency('USD');
    setBulkCostInput(quote.bulkCostUsd.toFixed(2));
    setUnitCountInput(String(quote.unitsPerBulk));
    setPricingFeedback(`Cargado costo de ${quote.supplierName} en la calculadora.`);
  };

  const breakEvenMetrics = useMemo(() => {
    const totalFixedUsd = round2(
      expenses.filter((e) => e.type === 'fixed').reduce((sum, e) => sum + e.amountUsd, 0)
    );
    const totalVariableUsd = round2(
      expenses.filter((e) => e.type === 'variable').reduce((sum, e) => sum + e.amountUsd, 0)
    );
    const totalExpensesUsd = round2(totalFixedUsd + totalVariableUsd);

    const salesRevenueUsd = round2(sales.reduce((sum, s) => sum + s.totalUsd, 0));
    const salesCogsUsd = round2(
      sales.reduce(
        (sum, s) => sum + s.items.reduce((itemSum, i) => itemSum + i.costUsd * i.quantity, 0),
        0
      )
    );

    let contributionMarginRatio = 0;
    let marginSourceLabel = 'margen real de ventas';

    if (salesRevenueUsd > 0) {
      const totalVariableCosts = salesCogsUsd + totalVariableUsd;
      contributionMarginRatio = (salesRevenueUsd - totalVariableCosts) / salesRevenueUsd;
    } else if (products.length > 0) {
      const avgRatio =
        products.reduce(
          (sum, p) => sum + (p.priceUsd > 0 ? (p.priceUsd - p.costUsd) / p.priceUsd : 0),
          0
        ) / products.length;
      contributionMarginRatio = avgRatio;
      marginSourceLabel = 'margen promedio del catálogo';
    }

    const safeMarginRatio = Math.max(0, contributionMarginRatio);
    const breakEvenSalesUsd =
      safeMarginRatio > 0 ? round2(totalFixedUsd / safeMarginRatio) : 0;
    const progressPct =
      breakEvenSalesUsd > 0
        ? round2(Math.min(100, (salesRevenueUsd / breakEvenSalesUsd) * 100))
        : 0;
    const missingToBreakEvenUsd = round2(Math.max(0, breakEvenSalesUsd - salesRevenueUsd));
    const netProfitUsd = round2(salesRevenueUsd - salesCogsUsd - totalExpensesUsd);

    return {
      totalFixedUsd,
      totalVariableUsd,
      totalExpensesUsd,
      salesRevenueUsd,
      contributionMarginPct: round2(safeMarginRatio * 100),
      marginSourceLabel,
      breakEvenSalesUsd,
      progressPct,
      missingToBreakEvenUsd,
      netProfitUsd,
    };
  }, [expenses, sales, products]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseFeedback('');
    const raw = parseFloat(expenseAmountInput.replace(',', '.'));
    if (!expenseDescription.trim() || !Number.isFinite(raw) || raw <= 0) return;

    const amountUsd =
      expenseCurrency === 'VES' ? round2(raw / exchangeRate) : round2(raw);

    await onAddExpense({
      branchId: expenseBranchId,
      type: expenseType,
      category: expenseCategory.trim() || 'General',
      description: expenseDescription.trim(),
      amountUsd,
      expenseDate,
    });

    setExpenseDescription('');
    setExpenseAmountInput('');
    setExpenseFeedback('Gasto registrado y punto de equilibrio recalculado.');
  };

  const startEditExpense = (expense: Expense) => {
    setConfirmDeleteExpenseId(null);
    setEditingExpenseId(expense.id);
    setEditExpType(expense.type);
    setEditExpBranchId(expense.branchId);
    setEditExpCategory(expense.category);
    setEditExpDescription(expense.description);
    setEditExpCurrency('USD');
    setEditExpAmount(expense.amountUsd.toFixed(2));
    setEditExpDate(expense.expenseDate);
    setExpenseFeedback('');
  };

  const handleSaveExpenseEdit = async () => {
    if (!editingExpenseId) return;
    const raw = parseFloat(editExpAmount.replace(',', '.'));
    if (!editExpDescription.trim() || !Number.isFinite(raw) || raw <= 0) return;

    const amountUsd =
      editExpCurrency === 'VES' ? round2(raw / exchangeRate) : round2(raw);

    setSavingExpenseEdit(true);
    try {
      await onUpdateExpense({
        id: editingExpenseId,
        branchId: editExpBranchId,
        type: editExpType,
        category: editExpCategory.trim() || 'General',
        description: editExpDescription.trim(),
        amountUsd,
        expenseDate: editExpDate || new Date().toISOString().slice(0, 10),
      });
      setEditingExpenseId(null);
      setExpenseFeedback('Gasto actualizado y métricas de equilibrio recalculadas.');
    } finally {
      setSavingExpenseEdit(false);
    }
  };

  const handleConfirmDeleteExpense = async (expense: Expense) => {
    await onDeleteExpense(expense.id);
    setConfirmDeleteExpenseId(null);
    if (editingExpenseId === expense.id) {
      setEditingExpenseId(null);
    }
    setExpenseFeedback(`Gasto "${expense.description}" eliminado y punto de equilibrio recalculado.`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
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
                  htmlFor="costing-product-search"
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
                    id="costing-product-search"
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
                        onClick={() => {
                          setCalcProductId(p.id);
                          setPricingFeedback('');
                        }}
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
                      onClick={() => setBulkInputCurrency('USD')}
                      className={`cursor-pointer ${
                        bulkInputCurrency === 'USD' ? 'text-[#558B00] underline' : 'text-slate-400'
                      }`}
                    >
                      USD
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkInputCurrency('VES')}
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

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col gap-2.5 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-slate-700" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Comparador de proveedores (menor costo unitario)
              </h2>
              <p className="text-xs text-slate-500">
                Ordena automáticamente del proveedor más económico al más costoso
              </p>
            </div>
          </div>

          <select
            aria-label="Producto a comparar"
            value={compareProductId}
            onChange={(e) => setCompareProductId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <form
          onSubmit={handleCreateSupplierQuote}
          className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12"
        >
          <input
            type="text"
            required
            placeholder="Nombre del proveedor *"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 sm:col-span-3 focus:border-[#76B900] focus:outline-none"
          />
          <input
            type="text"
            placeholder="Teléfono"
            value={supplierPhone}
            onChange={(e) => setSupplierPhone(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none"
          />
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="Costo bulto $"
            value={quoteBulkCostInput}
            onChange={(e) => setQuoteBulkCostInput(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none"
          />
          <input
            type="number"
            step="1"
            min="1"
            required
            placeholder="Und/bulto"
            value={quoteUnitsInput}
            onChange={(e) => setQuoteUnitsInput(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 sm:col-span-3 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        </form>

        {supplierFeedback && (
          <p className="text-xs font-semibold text-[#558B00]">{supplierFeedback}</p>
        )}

        {quotesForSelectedProduct.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            No hay cotizaciones registradas para este producto. Agrega al menos dos proveedores para comparar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Proveedor</th>
                  <th className="py-2 px-3 font-semibold text-right">Bulto ($)</th>
                  <th className="py-2 px-3 font-semibold text-right">Unidades</th>
                  <th className="py-2 px-3 font-semibold text-right">Costo unitario</th>
                  <th className="py-2 px-3 font-semibold text-right">Diferencia</th>
                  <th className="py-2 pl-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotesForSelectedProduct.map((quote, idx) => {
                  const bestUnitCost = quotesForSelectedProduct[0].unitCostUsd;
                  const diffPerUnit = round2(quote.unitCostUsd - bestUnitCost);
                  const isBest = idx === 0;

                  return (
                    <tr key={quote.id} className={isBest ? 'bg-[#F7FEE7]/70' : ''}>
                      <td className="py-2 pr-3">
                        <p className="font-semibold text-slate-900">
                          {quote.supplierName}{' '}
                          {isBest && (
                            <span className="font-semibold text-[#558B00]">· Mejor precio</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {quote.supplierPhone || 'Sin teléfono'} ·{' '}
                          {quote.syncStatus === 'synced' ? 'Sincronizado' : 'Pendiente offline'}
                        </p>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatUsd(quote.bulkCostUsd)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                        {quote.unitsPerBulk}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                        <p>{formatUsd(quote.unitCostUsd)}</p>
                        <p className="text-[11px] font-semibold text-[#558B00]">
                          {formatVes(round2(quote.unitCostUsd * exchangeRate))}
                        </p>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {isBest ? (
                          <span className="font-semibold text-[#558B00]">Base</span>
                        ) : (
                          <span className="text-red-600">+{formatUsd(diffPerUnit)}/und</span>
                        )}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUseQuoteInCalculator(quote)}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#76B900] hover:text-slate-900 cursor-pointer whitespace-nowrap"
                          >
                            Usar costo
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteSupplierQuote(quote.id)}
                            aria-label="Eliminar cotización"
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <Scale className="h-4 w-4 text-slate-700" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Gastos fijos / variables y punto de equilibrio
            </h2>
            <p className="text-xs text-slate-500">
              {activeCashier.name} · Calculado con {breakEvenMetrics.marginSourceLabel} (
              {breakEvenMetrics.contributionMarginPct}%)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono tabular-nums">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="font-sans text-[11px] font-medium text-slate-500">Gastos fijos</p>
            <p
              className={`mt-1 text-base font-bold ${
                currency === 'VES' ? 'text-[#558B00]' : 'text-slate-900'
              }`}
            >
              {formatPrimary(breakEvenMetrics.totalFixedUsd)}
            </p>
            <p className="text-[11px] text-slate-500">
              Variables: {formatPrimary(breakEvenMetrics.totalVariableUsd)}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="font-sans text-[11px] font-medium text-slate-500">Punto de equilibrio</p>
            <p className="mt-1 text-base font-bold text-slate-900">
              {formatUsd(breakEvenMetrics.breakEvenSalesUsd)}
            </p>
            <p className="text-[11px] font-semibold text-[#558B00]">
              {formatVes(round2(breakEvenMetrics.breakEvenSalesUsd * exchangeRate))}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="font-sans text-[11px] font-medium text-slate-500">Avance vs. equilibrio</p>
            <p className="mt-1 text-base font-bold text-[#558B00]">
              {breakEvenMetrics.progressPct}%
            </p>
            <p className="text-[11px] text-slate-500">
              {breakEvenMetrics.missingToBreakEvenUsd > 0
                ? `Faltan ${formatUsd(breakEvenMetrics.missingToBreakEvenUsd)}`
                : 'Equilibrio superado'}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="font-sans text-[11px] font-medium text-slate-500">
              Utilidad neta estimada
            </p>
            <p
              className={`mt-1 text-base font-bold ${
                breakEvenMetrics.netProfitUsd >= 0 ? 'text-[#558B00]' : 'text-red-600'
              }`}
            >
              {formatPrimary(breakEvenMetrics.netProfitUsd)}
            </p>
            <p className="text-[11px] text-slate-500">
              Ventas: {formatUsd(breakEvenMetrics.salesRevenueUsd)}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleCreateExpense}
          className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12"
        >
          <select
            value={expenseType}
            onChange={(e) => setExpenseType(e.target.value as ExpenseType)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none"
          >
            <option value="fixed">Gasto Fijo</option>
            <option value="variable">Gasto Variable</option>
          </select>

          <select
            value={isBranchLocked ? activeBranchId : expenseBranchId}
            disabled={isBranchLocked}
            onChange={(e) => {
              if (!isBranchLocked) setExpenseBranchId(e.target.value);
            }}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none disabled:cursor-not-allowed disabled:opacity-75"
          >
            {selectableBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Categoría (Alquiler, Servicios)"
            value={expenseCategory}
            onChange={(e) => setExpenseCategory(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none"
          />

          <input
            type="text"
            required
            placeholder="Descripción (ej: Nómina, Flete) *"
            value={expenseDescription}
            onChange={(e) => setExpenseDescription(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none"
          />

          <div className="flex sm:col-span-2">
            <select
              aria-label="Moneda del gasto"
              value={expenseCurrency}
              onChange={(e) => setExpenseCurrency(e.target.value as CurrencyMode)}
              className="rounded-l-md border border-r-0 border-slate-200 bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="USD">$</option>
              <option value="VES">Bs</option>
            </select>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="Monto"
              value={expenseAmountInput}
              onChange={(e) => setExpenseAmountInput(e.target.value)}
              className="w-full rounded-r-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
            />
          </div>

          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 sm:col-span-1 focus:border-[#76B900] focus:outline-none"
          />

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 rounded-md bg-[#84CC16] px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] sm:col-span-1 cursor-pointer whitespace-nowrap"
          >
            <Receipt className="h-3.5 w-3.5" />
            Guardar
          </button>
        </form>

        {expenseFeedback && (
          <p className="flex items-center gap-1.5 rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] px-3 py-1.5 text-xs font-semibold text-[#3F6212]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
            {expenseFeedback}
          </p>
        )}

        {expenses.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            No hay gastos fijos ni variables registrados. Registra un gasto arriba para calcular tu punto de equilibrio.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Fecha / Descripción</th>
                  <th className="py-2 px-3 font-semibold">Tipo</th>
                  <th className="py-2 px-3 font-semibold">Sucursal</th>
                  <th className="py-2 px-3 font-semibold text-right">Monto</th>
                  <th className="py-2 pl-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((expense) => {
                  const isEditing = editingExpenseId === expense.id;
                  const isConfirmingDelete = confirmDeleteExpenseId === expense.id;

                  if (isEditing) {
                    return (
                      <tr key={expense.id} className="bg-[#F7FEE7]/60">
                        <td colSpan={5} className="p-2.5">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                            <select
                              value={editExpType}
                              onChange={(e) => setEditExpType(e.target.value as ExpenseType)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none"
                            >
                              <option value="fixed">Fijo</option>
                              <option value="variable">Variable</option>
                            </select>

                            <select
                              value={isBranchLocked ? activeBranchId : editExpBranchId}
                              disabled={isBranchLocked}
                              onChange={(e) => {
                                if (!isBranchLocked) setEditExpBranchId(e.target.value);
                              }}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none disabled:cursor-not-allowed disabled:opacity-75"
                            >
                              {selectableBranches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>

                            <input
                              type="text"
                              value={editExpCategory}
                              onChange={(e) => setEditExpCategory(e.target.value)}
                              placeholder="Categoría"
                              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none"
                            />

                            <input
                              type="text"
                              value={editExpDescription}
                              onChange={(e) => setEditExpDescription(e.target.value)}
                              placeholder="Descripción *"
                              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 sm:col-span-2 focus:border-[#76B900] focus:outline-none"
                            />

                            <div className="flex sm:col-span-2">
                              <select
                                aria-label="Moneda edición gasto"
                                value={editExpCurrency}
                                onChange={(e) => setEditExpCurrency(e.target.value as CurrencyMode)}
                                className="rounded-l-md border border-r-0 border-slate-200 bg-slate-100 px-1.5 py-1.5 text-xs font-bold text-slate-700"
                              >
                                <option value="USD">$</option>
                                <option value="VES">Bs</option>
                              </select>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={editExpAmount}
                                onChange={(e) => setEditExpAmount(e.target.value)}
                                className="w-full rounded-r-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
                              />
                            </div>

                            <input
                              type="date"
                              value={editExpDate}
                              onChange={(e) => setEditExpDate(e.target.value)}
                              className="rounded-md border border-slate-200 bg-white px-1.5 py-1.5 font-mono text-xs text-slate-900 sm:col-span-1 focus:border-[#76B900] focus:outline-none"
                            />

                            <div className="flex items-center justify-end gap-1 sm:col-span-1">
                              <button
                                type="button"
                                disabled={savingExpenseEdit}
                                onClick={() => void handleSaveExpenseEdit()}
                                aria-label="Guardar gasto"
                                className="inline-flex items-center justify-center rounded-md bg-[#84CC16] p-1.5 text-slate-950 hover:bg-[#76B900] disabled:opacity-50 cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingExpenseId(null)}
                                aria-label="Cancelar edición"
                                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={expense.id} className="hover:bg-slate-50/70">
                      <td className="py-2 pr-3">
                        <p className="font-semibold text-slate-900">{expense.description}</p>
                        <p className="text-[11px] font-mono tabular-nums text-slate-500">
                          {expense.expenseDate} · {expense.category} ·{' '}
                          <span
                            className={
                              expense.syncStatus === 'synced'
                                ? 'font-sans font-semibold text-[#558B00]'
                                : 'font-sans font-semibold text-amber-700'
                            }
                          >
                            {expense.syncStatus === 'synced' ? 'Sincronizado' : 'Pendiente'}
                          </span>
                        </p>
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-700">
                        {expense.type === 'fixed' ? 'Fijo' : 'Variable'}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{expense.branchName}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                        <p>{formatUsd(expense.amountUsd)}</p>
                        <p className="text-[11px] font-semibold text-[#558B00]">
                          {formatVes(round2(expense.amountUsd * exchangeRate))}
                        </p>
                      </td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap">
                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleConfirmDeleteExpense(expense)}
                              className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-700 cursor-pointer"
                            >
                              Eliminar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteExpenseId(null)}
                              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditExpense(expense)}
                              aria-label={`Editar gasto ${expense.description}`}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#76B900] hover:text-slate-900 cursor-pointer"
                            >
                              <Pencil className="h-3 w-3" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteExpenseId(expense.id)}
                              aria-label={`Eliminar gasto ${expense.description}`}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
