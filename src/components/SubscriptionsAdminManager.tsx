import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  MessageCircle,
  Pencil,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  buildClientSubscriptionWhatsAppUrl,
  extendClientSubscriptionDays,
  fetchAllClientSubscriptions,
  updateClientSubscription,
  type AdminSubscriptionItem,
  type SubscriptionHealthStatus,
} from '../services/subscriptionAdmin';

type StatusFilter = 'all' | SubscriptionHealthStatus;

interface SubscriptionsAdminManagerProps {
  adminEmail: string;
  currentUserId: string;
  isOnline: boolean;
  onOwnSubscriptionUpdated?: () => Promise<void>;
}

const formatShortDate = (iso?: string): string => {
  if (!iso) return 'Sin fecha';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const toDateInputValue = (iso?: string): string => {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateInputToEndOfDayIso = (dateStr: string): string => {
  const [year, month, day] = dateStr.split('-').map((n) => parseInt(n, 10));
  if (!year || !month || !day) return new Date().toISOString();
  return new Date(year, month - 1, day, 23, 59, 59, 0).toISOString();
};

export const SubscriptionsAdminManager: React.FC<SubscriptionsAdminManagerProps> = ({
  adminEmail,
  currentUserId,
  isOnline,
  onOwnSubscriptionUpdated,
}) => {
  const [items, setItems] = useState<AdminSubscriptionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Edit modal state
  const [editingItem, setEditingItem] = useState<AdminSubscriptionItem | null>(null);
  const [editPlan, setEditPlan] = useState<string>('mensual');
  const [editStatus, setEditStatus] = useState<string>('active');
  const [editExpiryDate, setEditExpiryDate] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string>('');

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAllClientSubscriptions();
      setItems(result.items);
      if (result.errorMessage) {
        setError(result.errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const counts = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    items.forEach((item) => {
      if (item.health === 'active') active += 1;
      else if (item.health === 'expiring') expiring += 1;
      else expired += 1;
    });
    return { total: items.length, active, expiring, expired };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.health !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.email.toLowerCase().includes(q) ||
        item.businessName.toLowerCase().includes(q) ||
        item.plan.toLowerCase().includes(q) ||
        item.planLabel.toLowerCase().includes(q) ||
        item.phone.toLowerCase().includes(q) ||
        item.rif.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q)
      );
    });
  }, [items, statusFilter, searchQuery]);

  const handleQuickExtend = async (item: AdminSubscriptionItem, days: number) => {
    if (!isOnline) {
      setFeedback({
        type: 'err',
        text: 'Se requiere conexión a internet para actualizar suscripciones en Supabase.',
      });
      return;
    }

    const opKey = `${item.userId}:${days}`;
    setBusyKey(opKey);
    setFeedback(null);

    try {
      const res = await extendClientSubscriptionDays(item, days);
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text: res.errorMessage || 'No se pudo extender la suscripción.',
        });
        return;
      }

      const clientLabel = item.email || item.businessName || 'el cliente';
      setFeedback({
        type: 'ok',
        text: `+${days} días aplicados a ${clientLabel}. Nuevo vencimiento: ${formatShortDate(
          res.nextExpiresAt
        )}.`,
      });

      await loadSubscriptions();
      if (item.userId === currentUserId && onOwnSubscriptionUpdated) {
        await onOwnSubscriptionUpdated();
      }
    } finally {
      setBusyKey(null);
    }
  };

  const openEditModal = (item: AdminSubscriptionItem) => {
    setEditingItem(item);
    setEditPlan(item.plan || 'mensual');
    setEditStatus(
      item.status === 'active' ||
        item.status === 'trial' ||
        item.status === 'suspended' ||
        item.status === 'expired'
        ? item.status
        : 'suspended'
    );
    setEditExpiryDate(toDateInputValue(item.expiresAt));
    setEditNotes(item.notes || '');
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!isOnline) {
      setEditError('Se requiere conexión a internet para guardar cambios en Supabase.');
      return;
    }
    if (!editExpiryDate) {
      setEditError('Selecciona una fecha de vencimiento válida.');
      return;
    }

    setEditError('');
    setSavingEdit(true);
    try {
      const nextExpiresAt = dateInputToEndOfDayIso(editExpiryDate);
      const res = await updateClientSubscription({
        userId: editingItem.userId,
        plan: editPlan,
        status: editStatus,
        expiresAt: nextExpiresAt,
        notes: editNotes,
      });

      if (!res.ok) {
        setEditError(res.errorMessage || 'No se pudo guardar la suscripción.');
        return;
      }

      const clientLabel = editingItem.email || editingItem.businessName || 'el cliente';
      setFeedback({
        type: 'ok',
        text: `Suscripción de ${clientLabel} actualizada correctamente.`,
      });
      setEditingItem(null);

      await loadSubscriptions();
      if (editingItem.userId === currentUserId && onOwnSubscriptionUpdated) {
        await onOwnSubscriptionUpdated();
      }
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 text-[#76B900] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900">
                Suscripciones de clientes
              </h2>
              <p className="truncate text-xs text-slate-500">
                Panel Super Admin ({adminEmail}) · Gestión directa en Supabase
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadSubscriptions()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#76B900] hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#76B900]' : ''}`} />
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 tabular-nums">
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'active' ? 'all' : 'active'))}
            className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
              statusFilter === 'active'
                ? 'border-[#76B900] bg-[#F7FEE7]/70'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-50'
            }`}
          >
            <p className="text-[11px] font-medium text-slate-500">Activos</p>
            <p className="mt-0.5 text-lg font-bold text-[#558B00]">{counts.active}</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'expiring' ? 'all' : 'expiring'))}
            className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
              statusFilter === 'expiring'
                ? 'border-amber-400 bg-amber-50'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-50'
            }`}
          >
            <p className="text-[11px] font-medium text-slate-500">Por vencer</p>
            <p className="mt-0.5 text-lg font-bold text-amber-700">{counts.expiring}</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'expired' ? 'all' : 'expired'))}
            className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
              statusFilter === 'expired'
                ? 'border-red-300 bg-red-50'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-50'
            }`}
          >
            <p className="text-[11px] font-medium text-slate-500">Vencidos</p>
            <p className="mt-0.5 text-lg font-bold text-red-600">{counts.expired}</p>
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar comercio, correo, plan o teléfono..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 overflow-x-auto no-scrollbar self-start sm:self-auto">
            {(
              [
                { id: 'all', label: `Todos (${counts.total})` },
                { id: 'active', label: 'Activos' },
                { id: 'expiring', label: 'Por vencer' },
                { id: 'expired', label: 'Vencidos' },
              ] as Array<{ id: StatusFilter; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === opt.id
                    ? 'bg-[#84CC16] text-slate-950'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212]'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#76B900]" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white p-4"
            />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-semibold text-slate-800">
            No se encontraron suscripciones
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ajusta el filtro o búsqueda, o pulsa Actualizar para consultar Supabase.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const whatsappUrl = buildClientSubscriptionWhatsAppUrl(item);
            const displayEmail = item.email || 'Correo no disponible';
            const normalizedEmail = item.email.trim().toLowerCase();
            const distinctBusinessName =
              item.businessName && item.businessName.trim().toLowerCase() !== normalizedEmail
                ? item.businessName
                : '';
            const secondaryDetails = [distinctBusinessName, item.phone, item.rif]
              .filter(Boolean)
              .join(' · ');
            const isRowBusy = busyKey !== null && busyKey.startsWith(`${item.userId}:`);

            return (
              <article
                key={item.userId}
                className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-[13px] font-semibold text-slate-900 truncate">
                        {displayEmail}
                      </h3>
                      {item.userId === currentUserId && (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          Tu cuenta
                        </span>
                      )}
                    </div>
                    {secondaryDetails && (
                      <p className="mt-0.5 text-xs text-slate-600 truncate">
                        {secondaryDetails}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      {item.planLabel}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        item.health === 'active'
                          ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212]'
                          : item.health === 'expiring'
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-red-200 bg-red-50 text-red-700'
                      }`}
                    >
                      {item.statusLabel}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-xs sm:grid-cols-4 tabular-nums">
                  <div>
                    <p className="text-[11px] text-slate-400">Inicio</p>
                    <p className="font-semibold text-slate-700">{formatShortDate(item.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Vencimiento</p>
                    <p className="font-semibold text-slate-900">{formatShortDate(item.expiresAt)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Transcurrido</p>
                    <p className="font-medium text-slate-600">
                      {item.daysElapsed === 0
                        ? 'Hoy'
                        : `${item.daysElapsed} día${item.daysElapsed === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Restante</p>
                    <p
                      className={`font-semibold ${
                        item.health === 'active'
                          ? 'text-[#558B00]'
                          : item.health === 'expiring'
                          ? 'text-amber-700'
                          : 'text-red-600'
                      }`}
                    >
                      {item.daysRemaining > 0
                        ? `${item.daysRemaining} día${item.daysRemaining === 1 ? '' : 's'}`
                        : item.daysOverdue > 0
                        ? `Vencido (${item.daysOverdue}d)`
                        : '0 días'}
                    </p>
                  </div>
                </div>

                {item.notes && (
                  <p className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">Nota:</span> {item.notes}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[7, 15, 30].map((days) => {
                      const isThisBusy = busyKey === `${item.userId}:${days}`;
                      return (
                        <button
                          key={days}
                          type="button"
                          disabled={isRowBusy}
                          onClick={() => void handleQuickExtend(item, days)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#84CC16]/50 bg-[#F7FEE7] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#3F6212] hover:bg-[#ECFCCB] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Clock className="h-3 w-3 text-[#558B00]" />
                          {isThisBusy ? 'Guardando...' : `+${days} días`}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-[#76B900] hover:text-[#3F6212] transition-colors whitespace-nowrap"
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-[#558B00]" />
                        WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={isRowBusy}
                      onClick={() => openEditModal(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-[#76B900] hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Editar suscripción</h3>
                <p className="truncate text-xs text-slate-500">
                  {editingItem.email || 'Correo no disponible'}
                  {editingItem.businessName &&
                  editingItem.businessName.trim().toLowerCase() !==
                    editingItem.email.trim().toLowerCase()
                    ? ` · ${editingItem.businessName}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                aria-label="Cerrar editor de suscripción"
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="sub-edit-status"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Estado
                  </label>
                  <select
                    id="sub-edit-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  >
                    <option value="active">Activo</option>
                    <option value="trial">Prueba</option>
                    <option value="suspended">Suspendido</option>
                    <option value="expired">Vencido</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="sub-edit-plan"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Plan
                  </label>
                  <input
                    id="sub-edit-plan"
                    type="text"
                    required
                    maxLength={60}
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    placeholder="Ej: mensual, trial, anual"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="sub-edit-expiry"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Fecha de vencimiento
                </label>
                <div className="relative mt-1">
                  <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="sub-edit-expiry"
                    type="date"
                    required
                    value={editExpiryDate}
                    onChange={(e) => setEditExpiryDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs font-semibold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="sub-edit-notes"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Notas (opcional)
                </label>
                <textarea
                  id="sub-edit-notes"
                  rows={2}
                  maxLength={400}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Referencia de pago, acuerdo comercial o recordatorio..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>

              {editError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {editError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:opacity-50 transition-colors cursor-pointer"
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
