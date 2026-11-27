import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Filter,
  Plus,
  Receipt,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { Branch, Cashier, CurrencyMode, SyncStatus } from '../types/pos';
import { db } from '../db/posDb';

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

export type ServiceType = 'recharge' | 'cash_advance';
export type RechargeProvider = 'Movilnet' | 'Digitel' | 'Movistar' | 'Free Fire';

export interface ServiceRecord {
  id: string;
  serviceType: ServiceType;
  provider: RechargeProvider | 'Avance de efectivo' | string;
  targetRef: string;
  rechargeAmountUsd: number;
  chargeAmountUsd: number;
  profitUsd: number;
  rechargeAmountBs: number;
  chargeAmountBs: number;
  profitBs: number;
  references: string[];
  date: string;
  cashierId: string;
  cashierName: string;
  branchId: string;
  branchName: string;
  notes?: string;
  createdAt: string;
  syncStatus: SyncStatus;
  syncedAt?: string;
}

interface ServicesManagerProps {
  branches: Branch[];
  activeBranchId: string;
  activeCashier: Cashier;
  currency: CurrencyMode;
  exchangeRate: number;
  isBranchLocked?: boolean;
  onBack?: () => void;
}

const SERVICES_STORAGE_KEY = 'pos_service_records_v1';

export const ServicesManager: React.FC<ServicesManagerProps> = ({
  branches,
  activeBranchId,
  activeCashier,
  currency,
  exchangeRate,
  isBranchLocked = false,
  onBack,
}) => {
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'recharge' | 'cash_advance'>('recharge');

  // Form state for Recargas (Bolívares inputs)
  const [rechargeProvider, setRechargeProvider] = useState<RechargeProvider>('Movilnet');
  const [rechargePhoneOrUid, setRechargePhoneOrUid] = useState<string>('');
  const [rechargeAmountBsInput, setRechargeAmountBsInput] = useState<string>('');
  const [chargeAmountBsInput, setChargeAmountBsInput] = useState<string>('');
  const [profitPercent, setProfitPercent] = useState<string>('20');
  const [manualChargeOverride, setManualChargeOverride] = useState<boolean>(false);
  const [rechargeReferences, setRechargeReferences] = useState<string[]>(['']);
  const [rechargeDate, setRechargeDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [rechargeNotes, setRechargeNotes] = useState<string>('');

  // Form state for Avance de efectivo
  const [advanceCustomerRef, setAdvanceCustomerRef] = useState<string>('');
  const [advanceAmountInput, setAdvanceAmountInput] = useState<string>('');
  const [advanceFeeInput, setAdvanceFeeInput] = useState<string>('');
  const [advanceReferences, setAdvanceReferences] = useState<string[]>(['']);
  const [advanceDate, setAdvanceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [advanceNotes, setAdvanceNotes] = useState<string>('');

  const [serviceBranchId, setServiceBranchId] = useState<string>(activeBranchId);
  const [feedback, setFeedback] = useState<string>('');

  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'recharge' | 'cash_advance'>('all');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const loadRecords = async () => {
      try {
        const entry = await db.settings.get(SERVICES_STORAGE_KEY);
        if (entry && entry.value && isMounted) {
          const parsed = JSON.parse(entry.value) as ServiceRecord[];
          if (Array.isArray(parsed)) {
            const migrated = parsed.map((r) => ({
              ...r,
              rechargeAmountBs: r.rechargeAmountBs ?? round2(r.rechargeAmountUsd * exchangeRate),
              chargeAmountBs: r.chargeAmountBs ?? round2(r.chargeAmountUsd * exchangeRate),
              profitBs: r.profitBs ?? round2(r.profitUsd * exchangeRate),
            }));
            setRecords(migrated);
          }
        }
      } catch (err) {
        console.error('Failed to load service records', err);
      }
    };
    void loadRecords();
    return () => {
      isMounted = false;
    };
  }, [exchangeRate]);

  const saveRecordsToDb = async (nextRecords: ServiceRecord[]) => {
    setRecords(nextRecords);
    try {
      await db.settings.put({
        key: SERVICES_STORAGE_KEY,
        value: JSON.stringify(nextRecords),
      });
    } catch (err) {
      console.error('Failed to save service records', err);
    }
  };

  // Automatic calculation for recharges: configurable profit percentage + rounded UP to nearest multiple of 50 in Bs
  useEffect(() => {
    if (activeTab === 'recharge' && !manualChargeOverride) {
      const amtBs = parseFloat(rechargeAmountBsInput.replace(',', '.')) || 0;
      const pct = parseFloat(profitPercent.replace(',', '.')) || 20;
      if (amtBs > 0) {
        const markupBs = amtBs * (1 + pct / 100);
        const roundedBs = Math.ceil(markupBs / 50) * 50;
        setChargeAmountBsInput(roundedBs.toFixed(2));
      } else {
        setChargeAmountBsInput('');
      }
    }
  }, [rechargeAmountBsInput, profitPercent, activeTab, manualChargeOverride]);

  const rechargeBsNum = parseFloat(rechargeAmountBsInput.replace(',', '.')) || 0;
  const chargeBsNum = parseFloat(chargeAmountBsInput.replace(',', '.')) || 0;
  const profitBsNum = round2(Math.max(0, chargeBsNum - rechargeBsNum));
  const effectiveExchangeRate = exchangeRate > 0 ? exchangeRate : 1;
  const rechargeUsdRef = round2(rechargeBsNum / effectiveExchangeRate);
  const chargeUsdRef = round2(chargeBsNum / effectiveExchangeRate);
  const profitUsdRef = round2(profitBsNum / effectiveExchangeRate);

  const handleAddRechargeReference = () => {
    setRechargeReferences((prev) => [...prev, '']);
  };

  const handleRemoveRechargeReference = (index: number) => {
    setRechargeReferences((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateRechargeReference = (index: number, val: string) => {
    setRechargeReferences((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleAddAdvanceReference = () => {
    setAdvanceReferences((prev) => [...prev, '']);
  };

  const handleRemoveAdvanceReference = (index: number) => {
    setAdvanceReferences((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateAdvanceReference = (index: number, val: string) => {
    setAdvanceReferences((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleCreateRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    if (rechargeBsNum <= 0 || chargeBsNum <= 0 || !rechargePhoneOrUid.trim()) return;

    const validRefs = rechargeReferences.map((r) => r.trim()).filter(Boolean);
    const branch = branches.find((b) => b.id === serviceBranchId) || branches[0];

    const newRecord: ServiceRecord = {
      id: `srv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      serviceType: 'recharge',
      provider: rechargeProvider,
      targetRef: rechargePhoneOrUid.trim(),
      rechargeAmountUsd: rechargeUsdRef,
      chargeAmountUsd: chargeUsdRef,
      profitUsd: profitUsdRef,
      rechargeAmountBs: round2(rechargeBsNum),
      chargeAmountBs: round2(chargeBsNum),
      profitBs: profitBsNum,
      references: validRefs,
      date: rechargeDate || new Date().toISOString().slice(0, 10),
      cashierId: activeCashier.id,
      cashierName: activeCashier.name,
      branchId: branch?.id || activeBranchId,
      branchName: branch?.name || 'Principal',
      notes: rechargeNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    const nextRecords = [newRecord, ...records];
    await saveRecordsToDb(nextRecords);

    setRechargePhoneOrUid('');
    setRechargeAmountBsInput('');
    setChargeAmountBsInput('');
    setManualChargeOverride(false);
    setRechargeReferences(['']);
    setRechargeNotes('');
    setFeedback(`Recarga de ${rechargeProvider} registrada con éxito. Ganancia: Bs ${profitBsNum.toFixed(2)} (${formatUsd(profitUsdRef)})`);
  };

  const handleCreateCashAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    const advanceAmt = parseFloat(advanceAmountInput.replace(',', '.')) || 0;
    const feeAmt = parseFloat(advanceFeeInput.replace(',', '.')) || 0;
    if (advanceAmt <= 0 || feeAmt < 0 || !advanceCustomerRef.trim()) return;

    const profit = round2(feeAmt);
    const validRefs = advanceReferences.map((r) => r.trim()).filter(Boolean);
    const branch = branches.find((b) => b.id === serviceBranchId) || branches[0];

    const newRecord: ServiceRecord = {
      id: `srv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      serviceType: 'cash_advance',
      provider: 'Avance de efectivo',
      targetRef: advanceCustomerRef.trim(),
      rechargeAmountUsd: round2(advanceAmt / effectiveExchangeRate),
      chargeAmountUsd: round2((advanceAmt + feeAmt) / effectiveExchangeRate),
      profitUsd: round2(feeAmt / effectiveExchangeRate),
      rechargeAmountBs: round2(advanceAmt),
      chargeAmountBs: round2(advanceAmt + feeAmt),
      profitBs: profit,
      references: validRefs,
      date: advanceDate || new Date().toISOString().slice(0, 10),
      cashierId: activeCashier.id,
      cashierName: activeCashier.name,
      branchId: branch?.id || activeBranchId,
      branchName: branch?.name || 'Principal',
      notes: advanceNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    const nextRecords = [newRecord, ...records];
    await saveRecordsToDb(nextRecords);

    setAdvanceCustomerRef('');
    setAdvanceAmountInput('');
    setAdvanceFeeInput('');
    setAdvanceReferences(['']);
    setAdvanceNotes('');
    setFeedback(`Avance de efectivo registrado con éxito. Comisión/Ganancia: ${formatUsd(round2(feeAmt / effectiveExchangeRate))}`);
  };

  const handleDeleteRecord = async (id: string) => {
    const next = records.filter((r) => r.id !== id);
    await saveRecordsToDb(next);
    setFeedback('Registro de servicio eliminado.');
  };

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterType !== 'all' && r.serviceType !== filterType) return false;
      if (filterProvider !== 'all' && r.provider !== filterProvider) return false;
      if (filterDateFrom && r.date < filterDateFrom) return false;
      if (filterDateTo && r.date > filterDateTo) return false;
      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase();
        const matchesRef = r.targetRef.toLowerCase().includes(q);
        const matchesNotes = (r.notes || '').toLowerCase().includes(q);
        const matchesTransRef = r.references.some((ref) => ref.toLowerCase().includes(q));
        if (!matchesRef && !matchesNotes && !matchesTransRef) return false;
      }
      return true;
    });
  }, [records, filterType, filterProvider, filterQuery, filterDateFrom, filterDateTo]);

  const totals = useMemo(() => {
    let moneyOutBs = 0;
    let moneyCollectedBs = 0;
    let netProfitBs = 0;
    let moneyOutUsd = 0;
    let moneyCollectedUsd = 0;
    let netProfitUsd = 0;

    for (const r of filteredRecords) {
      moneyOutBs += r.rechargeAmountBs ?? (r.rechargeAmountUsd * exchangeRate);
      moneyCollectedBs += r.chargeAmountBs ?? (r.chargeAmountUsd * exchangeRate);
      netProfitBs += r.profitBs ?? (r.profitUsd * exchangeRate);

      moneyOutUsd += r.rechargeAmountUsd;
      moneyCollectedUsd += r.chargeAmountUsd;
      netProfitUsd += r.profitUsd;
    }

    return {
      moneyOutBs: round2(moneyOutBs),
      moneyCollectedBs: round2(moneyCollectedBs),
      netProfitBs: round2(netProfitBs),
      moneyOutUsd: round2(moneyOutUsd),
      moneyCollectedUsd: round2(moneyCollectedUsd),
      netProfitUsd: round2(netProfitUsd),
      count: filteredRecords.length,
    };
  }, [filteredRecords, exchangeRate]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
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
            <Smartphone className="h-5 w-5 text-[#76B900]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Módulo de Servicios</h2>
              <p className="text-xs text-slate-500">
                Tasa activa: Bs {exchangeRate.toFixed(2)} / $ · Recargas y Avances de efectivo
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('recharge')}
              className={`rounded-md px-3 py-1.5 transition-colors cursor-pointer ${
                activeTab === 'recharge'
                  ? 'bg-[#84CC16] text-slate-950 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Recargas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cash_advance')}
              className={`rounded-md px-3 py-1.5 transition-colors cursor-pointer ${
                activeTab === 'cash_advance'
                  ? 'bg-[#84CC16] text-slate-950 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Avance de efectivo
            </button>
          </div>
        </div>

        {feedback && (
          <p className="flex items-center gap-1.5 rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] px-3.5 py-2 text-xs font-semibold text-[#3F6212]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#76B900]" />
            {feedback}
          </p>
        )}

        {activeTab === 'recharge' ? (
          <form onSubmit={handleCreateRecharge} className="space-y-3.5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold text-slate-900">Registrar nueva recarga (Bolívares)</h3>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-600 font-semibold">Ganancia (%):</span>
                {['10', '15', '20', '25'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setProfitPercent(p);
                      setManualChargeOverride(false);
                    }}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold cursor-pointer ${
                      profitPercent === p
                        ? 'bg-[#84CC16] text-slate-950 shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="500"
                  value={profitPercent}
                  onChange={(e) => {
                    setProfitPercent(e.target.value);
                    setManualChargeOverride(false);
                  }}
                  className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-900 text-center focus:border-[#76B900] focus:outline-none"
                  title="Porcentaje personalizado"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Operadora / Servicio</label>
                <select
                  value={rechargeProvider}
                  onChange={(e) => setRechargeProvider(e.target.value as RechargeProvider)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#76B900] focus:outline-none"
                >
                  <option value="Movilnet">Movilnet</option>
                  <option value="Digitel">Digitel</option>
                  <option value="Movistar">Movistar</option>
                  <option value="Free Fire">Free Fire (UID)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {rechargeProvider === 'Free Fire' ? 'ID del Jugador / UID *' : 'Número de teléfono *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={rechargeProvider === 'Free Fire' ? 'Ej: 123456789' : 'Ej: 04141234567'}
                  value={rechargePhoneOrUid}
                  onChange={(e) => setRechargePhoneOrUid(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Monto recarga (Bs)</label>
                  <span className="text-[10px] text-slate-500">≈ {formatUsd(rechargeUsdRef)}</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={rechargeAmountBsInput}
                  onChange={(e) => {
                    setRechargeAmountBsInput(e.target.value);
                    setManualChargeOverride(false);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Monto a cobrar (Bs)</label>
                  <span className="text-[10px] text-slate-500">≈ {formatUsd(chargeUsdRef)}</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={chargeAmountBsInput}
                  onChange={(e) => {
                    setChargeAmountBsInput(e.target.value);
                    setManualChargeOverride(true);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Fecha</label>
                <input
                  type="date"
                  value={rechargeDate}
                  onChange={(e) => setRechargeDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Nota / Cliente opcional</label>
                <input
                  type="text"
                  placeholder="Nombre de cliente o detalles..."
                  value={rechargeNotes}
                  onChange={(e) => setRechargeNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">Referencias de la transacción</label>
                <button
                  type="button"
                  onClick={handleAddRechargeReference}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-[#558B00] hover:bg-[#F7FEE7] cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  Agregar referencia
                </button>
              </div>
              <div className="space-y-2">
                {rechargeReferences.map((refVal, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Número de referencia #${idx + 1}`}
                      value={refVal}
                      onChange={(e) => handleUpdateRechargeReference(idx, e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                    />
                    {rechargeReferences.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRechargeReference(idx)}
                        className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="font-mono text-xs text-slate-700">
                Ganancia estimada ({profitPercent}%):{' '}
                <span className="font-bold text-[#558B00]">
                  Bs {profitBsNum.toFixed(2)} ({formatUsd(profitUsdRef)})
                </span>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Registrar Recarga
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleCreateCashAdvance} className="space-y-3.5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="text-xs font-bold text-slate-900">Registrar avance de efectivo</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Cliente / Referencia *</label>
                <input
                  type="text"
                  required
                  placeholder="Nombre o teléfono del cliente"
                  value={advanceCustomerRef}
                  onChange={(e) => setAdvanceCustomerRef(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Monto entregado ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={advanceAmountInput}
                  onChange={(e) => setAdvanceAmountInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Comisión a cobrar ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={advanceFeeInput}
                  onChange={(e) => setAdvanceFeeInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Fecha</label>
                <input
                  type="date"
                  value={advanceDate}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Nota / Banco opcional</label>
                <input
                  type="text"
                  placeholder="Banco receptor, Zelle, etc..."
                  value={advanceNotes}
                  onChange={(e) => setAdvanceNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">Referencias de transferencia / pago</label>
                <button
                  type="button"
                  onClick={handleAddAdvanceReference}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-[#558B00] hover:bg-[#F7FEE7] cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  Agregar referencia
                </button>
              </div>
              <div className="space-y-2">
                {advanceReferences.map((refVal, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Número de referencia #${idx + 1}`}
                      value={refVal}
                      onChange={(e) => handleUpdateAdvanceReference(idx, e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                    />
                    {advanceReferences.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAdvanceReference(idx)}
                        className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="font-mono text-xs text-slate-700">
                Ganancia (Comisión):{' '}
                <span className="font-bold text-[#558B00]">{formatUsd(parseFloat(advanceFeeInput || '0'))}</span>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Registrar Avance
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Money Flow Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 font-mono tabular-nums">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-sans text-[11px] font-medium text-slate-500">Transacciones</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{totals.count}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-sans text-[11px] font-medium text-slate-500">Dinero que salió</p>
          <p className="mt-1 text-base font-bold text-slate-900">
            Bs {totals.moneyOutBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500">{formatUsd(totals.moneyOutUsd)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-sans text-[11px] font-medium text-slate-500">Dinero cobrado</p>
          <p className="mt-1 text-base font-bold text-[#558B00]">
            Bs {totals.moneyCollectedBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500">{formatUsd(totals.moneyCollectedUsd)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-sans text-[11px] font-medium text-slate-500">Ganancia neta</p>
          <p className="mt-1 text-base font-bold text-[#76B900]">
            Bs {totals.netProfitBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500">{formatUsd(totals.netProfitUsd)}</p>
        </div>
      </div>

      {/* Filters Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
          <Filter className="h-4 w-4 text-slate-700" />
          <h3 className="text-xs font-bold text-slate-900">Filtros de búsqueda y reporte</h3>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Tipo de servicio</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            >
              <option value="all">Todos los servicios</option>
              <option value="recharge">Recargas</option>
              <option value="cash_advance">Avance de efectivo</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Operadora / Proveedor</label>
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            >
              <option value="all">Todas las operadoras</option>
              <option value="Movilnet">Movilnet</option>
              <option value="Digitel">Digitel</option>
              <option value="Movistar">Movistar</option>
              <option value="Free Fire">Free Fire</option>
              <option value="Avance de efectivo">Avance de efectivo</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Buscar (Tel / Ref / Nota)</label>
            <input
              type="search"
              placeholder="Número, ID o referencia..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Desde</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700">Hasta</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Transactions Table */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-slate-700" />
            <h3 className="text-xs font-bold text-slate-900">
              Historial de Servicios ({filteredRecords.length})
            </h3>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            No hay registros de servicios que coincidan con los filtros.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Fecha / Tipo</th>
                  <th className="py-2 px-3 font-semibold">Proveedor / Destino</th>
                  <th className="py-2 px-3 font-semibold">Referencias</th>
                  <th className="py-2 px-3 font-semibold text-right">Monto Salida</th>
                  <th className="py-2 px-3 font-semibold text-right">Cobro Total</th>
                  <th className="py-2 px-3 font-semibold text-right">Ganancia</th>
                  <th className="py-2 pl-3 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {filteredRecords.map((r) => {
                  const outBs = r.rechargeAmountBs ?? (r.rechargeAmountUsd * exchangeRate);
                  const collectBs = r.chargeAmountBs ?? (r.chargeAmountUsd * exchangeRate);
                  const profitBs = r.profitBs ?? (r.profitUsd * exchangeRate);

                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3 font-sans">
                        <p className="font-semibold text-slate-900">{r.date}</p>
                        <p className="text-[11px] text-slate-500">
                          {r.serviceType === 'recharge' ? 'Recarga' : 'Avance'} · {r.branchName}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <p className="font-semibold text-slate-900">
                          {r.provider}
                        </p>
                        <p className="text-[11px] font-mono text-slate-600">
                          {r.targetRef} {r.notes ? `(${r.notes})` : ''}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        {r.references.length === 0 ? (
                          <span className="text-slate-400 text-[11px]">Sin referencia</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.references.map((ref, idx) => (
                              <span
                                key={idx}
                                className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 border border-slate-200"
                              >
                                {ref}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700">
                        <p>Bs {outBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[10px] text-slate-400">({formatUsd(r.rechargeAmountUsd)})</p>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        <p>Bs {collectBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[10px] text-slate-400 font-normal">({formatUsd(r.chargeAmountUsd)})</p>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#558B00]">
                        <p>Bs {profitBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[10px] text-[#76B900] font-normal">({formatUsd(r.profitUsd)})</p>
                      </td>
                      <td className="py-2.5 pl-3 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => void handleDeleteRecord(r.id)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          title="Eliminar registro"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
