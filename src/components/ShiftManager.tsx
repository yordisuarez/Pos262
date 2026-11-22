import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  LogOut,
  PlayCircle,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { Branch, Cashier, Sale, Shift } from '../types/pos';

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

interface CashierLoginModalProps {
  cashiers: Cashier[];
  branches: Branch[];
  activeCashier: Cashier | null;
  onLogin: (cashier: Cashier) => void;
  onClose?: () => void;
}

export const CashierLoginModal: React.FC<CashierLoginModalProps> = ({
  cashiers,
  branches,
  activeCashier,
  onLogin,
  onClose,
}) => {
  const [selectedCashierId, setSelectedCashierId] = useState<string>(
    activeCashier?.id || cashiers[0]?.id || ''
  );
  const [pinInput, setPinInput] = useState<string>('');
  const [error, setError] = useState<string>('');

  const selectedCashier = useMemo(
    () => cashiers.find((c) => c.id === selectedCashierId) || cashiers[0],
    [cashiers, selectedCashierId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCashier) return;
    if (pinInput.trim() !== selectedCashier.pin) {
      setError('PIN incorrecto. Verifica las credenciales del usuario seleccionado.');
      return;
    }
    setError('');
    setPinInput('');
    onLogin(selectedCashier);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Acceso de Cajero / Admin</h2>
              <p className="text-xs text-slate-500">Pos 262 — Selecciona usuario e ingresa tu PIN</p>
            </div>
          </div>
          {onClose && activeCashier && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Cancelar
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">Usuario</p>
            <div className="grid grid-cols-1 gap-2">
              {cashiers.map((cashier) => {
                const isSelected = cashier.id === selectedCashier?.id;
                const branch = branches.find((b) => b.id === cashier.branchId);
                return (
                  <button
                    key={cashier.id}
                    type="button"
                    onClick={() => {
                      setSelectedCashierId(cashier.id);
                      setError('');
                    }}
                    className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold">{cashier.name}</p>
                      <p className="text-xs text-slate-500">
                        {cashier.role === 'admin'
                          ? 'Administrador'
                          : cashier.role === 'manager'
                          ? 'Encargado'
                          : 'Cajero'}
                        {branch ? ` · ${branch.name}` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-slate-500">PIN: {cashier.pin}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="cashier-pin" className="block text-xs font-semibold text-slate-600">
              PIN de acceso (4 dígitos)
            </label>
            <div className="relative mt-1.5">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="cashier-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
                placeholder="••••"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setError('');
                }}
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 font-mono text-base tracking-widest text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <UserCheck className="h-4 w-4" />
            Ingresar a caja
          </button>
        </form>
      </div>
    </div>
  );
};

interface ShiftManagerProps {
  activeCashier: Cashier;
  activeBranch: Branch;
  branches: Branch[];
  activeShift: Shift | null;
  shifts: Shift[];
  sales: Sale[];
  onOpenShift: (params: {
    openingFundUsd: number;
    openingFundVes: number;
    openingNote?: string;
  }) => Promise<void>;
  onCloseShift: (params: {
    shiftId: string;
    countedCashUsd: number;
    countedCashVes: number;
    expectedCashUsd: number;
    expectedCashVes: number;
    digitalTotalUsd: number;
    creditTotalUsd: number;
    salesCount: number;
    closingNote?: string;
  }) => Promise<void>;
  onSwitchCashier: () => void;
}

export const ShiftManager: React.FC<ShiftManagerProps> = ({
  activeCashier,
  activeBranch,
  branches,
  activeShift,
  shifts,
  sales,
  onOpenShift,
  onCloseShift,
  onSwitchCashier,
}) => {
  const [openingFundUsdInput, setOpeningFundUsdInput] = useState<string>('50.00');
  const [openingFundVesInput, setOpeningFundVesInput] = useState<string>('2000.00');
  const [openingNote, setOpeningNote] = useState<string>('');
  const [openError, setOpenError] = useState<string>('');

  const [countedUsdInput, setCountedUsdInput] = useState<string>('');
  const [countedVesInput, setCountedVesInput] = useState<string>('');
  const [closingNote, setClosingNote] = useState<string>('');
  const [closeError, setCloseError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // History filters
  const [filterFromDate, setFilterFromDate] = useState<string>('');
  const [filterToDate, setFilterToDate] = useState<string>('');
  const [filterBranchId, setFilterBranchId] = useState<string>('all');

  // Compute expected cash and sales breakdown for active shift
  const activeShiftMetrics = useMemo(() => {
    if (!activeShift) {
      return {
        salesCount: 0,
        cashUsdIn: 0,
        cashVesIn: 0,
        expectedCashUsd: 0,
        expectedCashVes: 0,
        digitalTotalUsd: 0,
        creditTotalUsd: 0,
        totalSalesUsd: 0,
      };
    }

    const shiftSales = sales.filter(
      (s) =>
        s.shiftId === activeShift.id ||
        (!s.shiftId &&
          s.branchId === activeShift.branchId &&
          s.cashierId === activeShift.cashierId &&
          s.createdAt >= activeShift.openedAt)
    );

    let cashUsdIn = 0;
    let cashVesIn = 0;
    let digitalTotalUsd = 0;
    let creditTotalUsd = 0;
    let totalSalesUsd = 0;

    shiftSales.forEach((sale) => {
      totalSalesUsd = round2(totalSalesUsd + sale.totalUsd);
      creditTotalUsd = round2(creditTotalUsd + sale.pendingUsd);

      let hasCashUsdPayment = false;
      sale.payments.forEach((payment) => {
        if (payment.method === 'Efectivo Divisa $') {
          cashUsdIn = round2(cashUsdIn + payment.amountUsd);
          hasCashUsdPayment = true;
        } else if (payment.method === 'Efectivo Bs') {
          cashVesIn = round2(cashVesIn + payment.amountVes);
        } else {
          digitalTotalUsd = round2(digitalTotalUsd + payment.amountUsd);
        }
      });

      if (sale.changeUsd > 0) {
        if (hasCashUsdPayment) {
          cashUsdIn = round2(cashUsdIn - sale.changeUsd);
        } else {
          cashVesIn = round2(cashVesIn - round2(sale.changeUsd * sale.exchangeRate));
        }
      }
    });

    const expectedCashUsd = round2(activeShift.openingFundUsd + cashUsdIn);
    const expectedCashVes = round2(activeShift.openingFundVes + cashVesIn);

    return {
      salesCount: shiftSales.length,
      cashUsdIn,
      cashVesIn,
      expectedCashUsd,
      expectedCashVes,
      digitalTotalUsd,
      creditTotalUsd,
      totalSalesUsd,
    };
  }, [activeShift, sales]);

  const parsedCountedUsd = parseFloat(countedUsdInput.replace(',', '.'));
  const parsedCountedVes = parseFloat(countedVesInput.replace(',', '.'));
  const liveDiffUsd = Number.isFinite(parsedCountedUsd)
    ? round2(parsedCountedUsd - activeShiftMetrics.expectedCashUsd)
    : null;
  const liveDiffVes = Number.isFinite(parsedCountedVes)
    ? round2(parsedCountedVes - activeShiftMetrics.expectedCashVes)
    : null;

  const handleOpenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpenError('');
    setSuccessMessage('');

    const fundUsd = parseFloat(openingFundUsdInput.replace(',', '.'));
    const fundVes = parseFloat(openingFundVesInput.replace(',', '.'));

    if (!Number.isFinite(fundUsd) || fundUsd < 0 || !Number.isFinite(fundVes) || fundVes < 0) {
      setOpenError('Ingresa montos numéricos válidos (0 o mayor) para el fondo inicial en $ y Bs.');
      return;
    }

    await onOpenShift({
      openingFundUsd: round2(fundUsd),
      openingFundVes: round2(fundVes),
      openingNote: openingNote.trim() || undefined,
    });

    setOpeningNote('');
    setSuccessMessage('Turno abierto correctamente y registrado en IndexedDB.');
  };

  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    setCloseError('');
    setSuccessMessage('');

    const countedUsd = parseFloat(countedUsdInput.replace(',', '.'));
    const countedVes = parseFloat(countedVesInput.replace(',', '.'));

    if (!Number.isFinite(countedUsd) || countedUsd < 0 || !Number.isFinite(countedVes) || countedVes < 0) {
      setCloseError('Debes ingresar el conteo físico de efectivo en USD ($) y en Bolívares (Bs).');
      return;
    }

    await onCloseShift({
      shiftId: activeShift.id,
      countedCashUsd: round2(countedUsd),
      countedCashVes: round2(countedVes),
      expectedCashUsd: activeShiftMetrics.expectedCashUsd,
      expectedCashVes: activeShiftMetrics.expectedCashVes,
      digitalTotalUsd: activeShiftMetrics.digitalTotalUsd,
      creditTotalUsd: activeShiftMetrics.creditTotalUsd,
      salesCount: activeShiftMetrics.salesCount,
      closingNote: closingNote.trim() || undefined,
    });

    setCountedUsdInput('');
    setCountedVesInput('');
    setClosingNote('');
    setSuccessMessage('Turno cerrado y arqueo guardado en el historial.');
  };

  const filteredShiftHistory = useMemo(() => {
    return shifts.filter((shift) => {
      if (filterBranchId !== 'all' && shift.branchId !== filterBranchId) return false;
      const shiftDate = shift.openedAt.slice(0, 10);
      if (filterFromDate && shiftDate < filterFromDate) return false;
      if (filterToDate && shiftDate > filterToDate) return false;
      return true;
    });
  }, [shifts, filterBranchId, filterFromDate, filterToDate]);

  const renderDiffLabel = (diff: number, formatter: (v: number) => string) => {
    if (Math.abs(diff) < 0.01) {
      return <span className="font-semibold text-emerald-700">Cuadrado ({formatter(0)})</span>;
    }
    if (diff > 0) {
      return <span className="font-semibold text-emerald-700">Sobrante +{formatter(diff)}</span>;
    }
    return <span className="font-semibold text-red-600">Faltante {formatter(diff)}</span>;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-6">
      {/* Active Session Summary Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Sesión activa</p>
          <p className="text-base font-bold text-slate-900">
            {activeCashier.name}{' '}
            <span className="font-normal text-slate-500">
              · {activeCashier.role === 'admin' ? 'Administrador' : activeCashier.role === 'manager' ? 'Encargado' : 'Cajero'} · {activeBranch.name}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitchCashier}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cambiar cajero / PIN
        </button>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Open or Close Shift Card */}
      {!activeShift ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <PlayCircle className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Apertura de turno</h2>
              <p className="text-xs text-slate-500">
                Registra el fondo inicial en caja para {activeBranch.name} antes de iniciar ventas.
              </p>
            </div>
          </div>

          <form onSubmit={handleOpenSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Fondo inicial en Dólares (USD $) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={openingFundUsdInput}
                onChange={(e) => setOpeningFundUsdInput(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-bold tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Fondo inicial en Bolívares (Bs) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={openingFundVesInput}
                onChange={(e) => setOpeningFundVesInput(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-bold tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">
                Nota de apertura (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Sencillo en billetes de $1 y $5 recibido de turno anterior..."
                value={openingNote}
                onChange={(e) => setOpeningNote(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            {openError && (
              <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {openError}
              </p>
            )}

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                <PlayCircle className="h-4 w-4" />
                Abrir turno en {activeBranch.name}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Cierre y arqueo de caja — Turno abierto
                </h2>
                <p className="text-xs text-slate-500">
                  Abierto el{' '}
                  {new Date(activeShift.openedAt).toLocaleString('es-VE', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}{' '}
                  por {activeShift.cashierName} · {activeShift.branchName}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-700">
              {activeShiftMetrics.salesCount} ventas en este turno
            </span>
          </div>

          {/* Expected System Totals Summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono tabular-nums">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <p className="font-sans text-xs font-medium text-slate-500">Esperado en caja ($)</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatUsd(activeShiftMetrics.expectedCashUsd)}
              </p>
              <p className="mt-1 font-sans text-[11px] text-slate-500">
                Fondo {formatUsd(activeShift.openingFundUsd)} + Ventas {formatUsd(activeShiftMetrics.cashUsdIn)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <p className="font-sans text-xs font-medium text-slate-500">Esperado en caja (Bs)</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatVes(activeShiftMetrics.expectedCashVes)}
              </p>
              <p className="mt-1 font-sans text-[11px] text-slate-500">
                Fondo {formatVes(activeShift.openingFundVes)} + Ventas {formatVes(activeShiftMetrics.cashVesIn)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <p className="font-sans text-xs font-medium text-slate-500">Pagos digitales / banco</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatUsd(activeShiftMetrics.digitalTotalUsd)}
              </p>
              <p className="mt-1 font-sans text-[11px] text-slate-500">
                Pago Móvil, Biopago, Punto, USDT
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <p className="font-sans text-xs font-medium text-slate-500">Créditos otorgados</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatUsd(activeShiftMetrics.creditTotalUsd)}
              </p>
              <p className="mt-1 font-sans text-[11px] text-slate-500">
                Total vendido: {formatUsd(activeShiftMetrics.totalSalesUsd)}
              </p>
            </div>
          </div>

          {activeShift.openingNote && (
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Nota de apertura:</span>{' '}
              {activeShift.openingNote}
            </p>
          )}

          {/* Physical Cash Count Comparison Form */}
          <form onSubmit={handleCloseSubmit} className="space-y-4 border-t border-slate-200 pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Efectivo físico contado en USD ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder={activeShiftMetrics.expectedCashUsd.toFixed(2)}
                  value={countedUsdInput}
                  onChange={(e) => setCountedUsdInput(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-bold tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
                {liveDiffUsd !== null && (
                  <p className="mt-1 text-xs font-mono tabular-nums">
                    Diferencia $: {renderDiffLabel(liveDiffUsd, formatUsd)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Efectivo físico contado en Bolívares (Bs) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder={activeShiftMetrics.expectedCashVes.toFixed(2)}
                  value={countedVesInput}
                  onChange={(e) => setCountedVesInput(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-bold tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
                {liveDiffVes !== null && (
                  <p className="mt-1 text-xs font-mono tabular-nums">
                    Diferencia Bs: {renderDiffLabel(liveDiffVes, formatVes)}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Observaciones de cierre (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Retiro parcial guardado en caja fuerte, billetes deteriorados..."
                  value={closingNote}
                  onChange={(e) => setClosingNote(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            {closeError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {closeError}
              </p>
            )}

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Lock className="h-4 w-4" />
              Cerrar turno y guardar arqueo
            </button>
          </form>
        </section>
      )}

      {/* Shift History Filterable by Date */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Historial de turnos y cierres</h2>
            <p className="text-xs text-slate-500">
              {filteredShiftHistory.length} turnos registrados en IndexedDB
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500">Desde</label>
              <div className="relative mt-1">
                <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500">Hasta</label>
              <div className="relative mt-1">
                <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500">Sucursal</label>
              <select
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                <option value="all">Todas las sucursales</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {(filterFromDate || filterToDate || filterBranchId !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setFilterFromDate('');
                  setFilterToDate('');
                  setFilterBranchId('all');
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {filteredShiftHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Clock className="h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">Sin turnos para el filtro seleccionado</p>
            <p className="mt-1 text-xs text-slate-500">
              Abre un turno o ajusta el rango de fechas para consultar cierres anteriores.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Fecha / Cajero</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Fondo inicial</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Esperado</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Contado físico</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Diferencia</th>
                  <th className="py-2.5 pl-3 font-semibold text-right">Estado / Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShiftHistory.map((shift) => (
                  <tr key={shift.id} className="align-top hover:bg-slate-50/70">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-slate-900">
                        {shift.cashierName} · {shift.branchName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 font-mono tabular-nums">
                        Abre:{' '}
                        {new Date(shift.openedAt).toLocaleString('es-VE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                        {shift.closedAt
                          ? ` · Cierra: ${new Date(shift.closedAt).toLocaleString('es-VE', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}`
                          : ''}
                      </p>
                      {(shift.openingNote || shift.closingNote) && (
                        <p className="mt-1 text-[11px] text-slate-600">
                          {shift.openingNote ? `Apertura: ${shift.openingNote}` : ''}
                          {shift.openingNote && shift.closingNote ? ' | ' : ''}
                          {shift.closingNote ? `Cierre: ${shift.closingNote}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      <p>{formatUsd(shift.openingFundUsd)}</p>
                      <p className="text-[11px] text-slate-500">{formatVes(shift.openingFundVes)}</p>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {shift.status === 'closed' ? (
                        <>
                          <p>{formatUsd(shift.expectedCashUsd ?? 0)}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatVes(shift.expectedCashVes ?? 0)}
                          </p>
                        </>
                      ) : (
                        <span className="font-sans text-slate-400">En curso</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 font-semibold">
                      {shift.status === 'closed' ? (
                        <>
                          <p>{formatUsd(shift.countedCashUsd ?? 0)}</p>
                          <p className="text-[11px] font-normal text-slate-500">
                            {formatVes(shift.countedCashVes ?? 0)}
                          </p>
                        </>
                      ) : (
                        <span className="font-sans font-normal text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {shift.status === 'closed' ? (
                        <div className="space-y-0.5">
                          <p>{renderDiffLabel(shift.diffUsd ?? 0, formatUsd)}</p>
                          <p className="text-[11px]">
                            {renderDiffLabel(shift.diffVes ?? 0, formatVes)}
                          </p>
                        </div>
                      ) : (
                        <span className="font-sans text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 pl-3 text-right whitespace-nowrap">
                      <p
                        className={
                          shift.status === 'open'
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-slate-700'
                        }
                      >
                        {shift.status === 'open' ? 'Abierto' : 'Cerrado'}
                      </p>
                      <p
                        className={`mt-0.5 text-[11px] font-semibold ${
                          shift.syncStatus === 'synced' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {shift.syncStatus === 'synced' ? 'Sincronizado' : 'Pendiente offline'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
