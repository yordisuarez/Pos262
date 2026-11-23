import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  KeyRound,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  Store,
  Trash2,
  UserPlus,
  Users,
  WifiOff,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type {
  Branch,
  BusinessSettings,
  Cashier,
  CloudSyncState,
  SubscriptionState,
} from '../types/pos';
import type { PendingSyncSummary } from '../services/syncQueue';
import { buildSubscriptionRenewalWhatsAppUrl } from '../services/subscription';

interface SettingsManagerProps {
  cloudUser: User | null;
  isOnline: boolean;
  isSyncing: boolean;
  cloudSyncState: CloudSyncState;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  pendingSyncSummary: PendingSyncSummary;
  subscription: SubscriptionState;
  businessSettings: BusinessSettings;
  cashiers: Cashier[];
  activeCashier: Cashier | null;
  branches: Branch[];
  activeBranchId: string;
  counts: {
    products: number;
    customers: number;
    sales: number;
    shifts: number;
    transfers: number;
    quotes: number;
    expenses: number;
  };
  onSaveBusinessSettings: (next: {
    businessName: string;
    rif: string;
    phone: string;
    address: string;
    exchangeRate: number;
  }) => Promise<void>;
  onManualSync: () => Promise<string | null>;
  onOpenCloudAuth: () => void;
  onSignOutCloud: () => Promise<void>;
  onOpenSyncQueue: () => void;
  onCreateCashier: (params: { name: string; pin: string; branchId: string }) => Promise<Cashier>;
  onDeleteCashier: (cashierId: string) => Promise<void>;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  cloudUser,
  isOnline,
  isSyncing,
  cloudSyncState,
  lastSyncedAt,
  lastSyncError,
  pendingSyncSummary,
  subscription,
  businessSettings,
  cashiers,
  activeCashier,
  branches,
  activeBranchId,
  counts,
  onSaveBusinessSettings,
  onManualSync,
  onOpenCloudAuth,
  onSignOutCloud,
  onOpenSyncQueue,
  onCreateCashier,
  onDeleteCashier,
}) => {
  const [businessName, setBusinessName] = useState<string>(businessSettings.businessName);
  const [rif, setRif] = useState<string>(businessSettings.rif);
  const [phone, setPhone] = useState<string>(businessSettings.phone);
  const [address, setAddress] = useState<string>(businessSettings.address);
  const [exchangeRateInput, setExchangeRateInput] = useState<string>(
    businessSettings.exchangeRate.toFixed(2)
  );
  const [saving, setSaving] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [syncFeedback, setSyncFeedback] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  // Internal cashier creation state
  const [showAddCashierForm, setShowAddCashierForm] = useState<boolean>(false);
  const [newCashierName, setNewCashierName] = useState<string>('');
  const [newCashierPin, setNewCashierPin] = useState<string>('');
  const [newCashierBranchId, setNewCashierBranchId] = useState<string>(
    activeBranchId || branches[0]?.id || 'branch-centro'
  );
  const [cashierFormError, setCashierFormError] = useState<string>('');
  const [cashierFormSuccess, setCashierFormSuccess] = useState<string>('');
  const [creatingCashier, setCreatingCashier] = useState<boolean>(false);

  useEffect(() => {
    setBusinessName(businessSettings.businessName);
    setRif(businessSettings.rif);
    setPhone(businessSettings.phone);
    setAddress(businessSettings.address);
    setExchangeRateInput(businessSettings.exchangeRate.toFixed(2));
  }, [businessSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaveMessage('');

    const trimmedName = businessName.trim();
    const parsedRate = parseFloat(exchangeRateInput.replace(',', '.'));

    if (!trimmedName) {
      setFormError('El nombre del comercio es obligatorio.');
      return;
    }
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setFormError('Ingresa una tasa de cambio válida mayor a 0.');
      return;
    }

    setSaving(true);
    try {
      await onSaveBusinessSettings({
        businessName: trimmedName,
        rif: rif.trim(),
        phone: phone.trim(),
        address: address.trim(),
        exchangeRate: Math.round((parsedRate + Number.EPSILON) * 100) / 100,
      });
      setSaveMessage(
        cloudUser && isOnline
          ? 'Datos del comercio guardados en IndexedDB y sincronizados con la nube.'
          : 'Datos del comercio guardados en IndexedDB (se sincronizarán al conectar).'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOutCloud();
    } finally {
      setSigningOut(false);
    }
  };

  const handleTriggerManualSync = async () => {
    setSyncFeedback('');
    const message = await onManualSync();
    if (message) {
      setSyncFeedback(message);
    }
  };

  const handleAddCashierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashierFormError('');
    setCashierFormSuccess('');

    const trimmedName = newCashierName.trim();
    if (!trimmedName) {
      setCashierFormError('Ingresa el nombre del Cajero.');
      return;
    }
    if (!/^\d{4}$/.test(newCashierPin)) {
      setCashierFormError('El PIN de acceso debe tener exactamente 4 dígitos numéricos.');
      return;
    }

    setCreatingCashier(true);
    try {
      await onCreateCashier({
        name: trimmedName,
        pin: newCashierPin,
        branchId: newCashierBranchId || activeBranchId || branches[0]?.id || 'branch-centro',
      });
      setNewCashierName('');
      setNewCashierPin('');
      setCashierFormSuccess(`Cajero "${trimmedName}" creado correctamente.`);
      setShowAddCashierForm(false);
    } finally {
      setCreatingCashier(false);
    }
  };

  const syncStatusLabel =
    cloudSyncState === 'offline'
      ? 'Offline'
      : cloudSyncState === 'syncing'
      ? 'Sincronizando...'
      : cloudSyncState === 'synced'
      ? 'Sincronizado'
      : cloudSyncState === 'pending'
      ? `Pendiente (${pendingSyncSummary.total})`
      : cloudSyncState === 'error'
      ? 'Error de sincronización'
      : 'Solo local (sin nube)';

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3.5">
          <div className="flex items-center gap-2">
            {cloudUser ? (
              <Cloud className="h-4 w-4 text-[#76B900]" />
            ) : (
              <CloudOff className="h-4 w-4 text-slate-400" />
            )}
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Cuenta en la nube y sincronización (Supabase)
              </h2>
              <p className="text-xs text-slate-500">
                IndexedDB opera al instante en caja; la nube sincroniza tus dispositivos automáticamente.
              </p>
            </div>
          </div>

          <span
            className={`text-xs font-semibold ${
              cloudSyncState === 'synced'
                ? 'text-[#558B00]'
                : cloudSyncState === 'offline' || cloudSyncState === 'pending'
                ? 'text-amber-700'
                : cloudSyncState === 'error'
                ? 'text-red-600'
                : 'text-slate-500'
            }`}
          >
            {syncStatusLabel}
          </span>
        </div>

        {cloudUser ? (
          <div className="space-y-3.5">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">Correo conectado</p>
                <p className="truncate text-sm font-bold text-slate-900">{cloudUser.email}</p>
                <p className="mt-0.5 text-[11px] text-slate-500 font-mono tabular-nums">
                  {lastSyncedAt
                    ? `Última sincronización: ${new Date(lastSyncedAt).toLocaleString('es-VE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}`
                    : 'Aún sin sincronización completada'}
                  {' · '}
                  Pendientes: {pendingSyncSummary.total}
                </p>
                {subscription.record && subscription.accessStatus === 'active' && (
                  <p className="mt-1 text-[11px] font-medium text-slate-600 font-mono tabular-nums">
                    <span className="font-sans font-semibold text-[#558B00]">
                      {subscription.planLabel}
                    </span>
                    {' · '}
                    Vigente hasta{' '}
                    {new Date(subscription.record.expiresAt).toLocaleDateString('es-VE', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {subscription.daysRemaining !== null && (
                      <>
                        {' · '}
                        {subscription.daysRemaining === 1
                          ? '1 día restante'
                          : `${subscription.daysRemaining} días restantes`}
                      </>
                    )}
                    {' · '}
                    <a
                      href={buildSubscriptionRenewalWhatsAppUrl(cloudUser.email)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-sans font-bold text-[#558B00] underline underline-offset-2 hover:text-[#3F6212]"
                    >
                      Renovar
                    </a>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!isOnline || isSyncing}
                  onClick={() => void handleTriggerManualSync()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                </button>

                <button
                  type="button"
                  disabled={signingOut}
                  onClick={() => void handleSignOut()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {signingOut ? 'Cerrando...' : 'Cerrar sesión nube'}
                </button>
              </div>
            </div>

            {syncFeedback && !lastSyncError && (
              <div className="flex items-center gap-1.5 rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] px-3 py-2 text-xs font-medium text-[#3F6212]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
                <span>{syncFeedback}</span>
              </div>
            )}

            {!isOnline && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  Sin conexión a internet. Todas las ventas y movimientos se guardan localmente y se subirán automáticamente al reconectar.
                </span>
              </div>
            )}

            {lastSyncError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                Detalle de sincronización: {lastSyncError}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-slate-900">
                Dispositivo operando en modo local (IndexedDB)
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Inicia sesión o registra tu comercio para respaldar y sincronizar datos entre teléfono y navegador.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCloudAuth}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Cloud className="h-3.5 w-3.5" />
              Vincular cuenta en la nube
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#76B900]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Usuarios internos (Administrador y Cajeros)
              </h2>
              <p className="text-xs text-slate-500">
                Administra los perfiles con acceso a caja. Los PIN de 4 dígitos permanecen siempre ocultos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowAddCashierForm((prev) => !prev);
              setCashierFormError('');
              setCashierFormSuccess('');
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {showAddCashierForm ? 'Cerrar formulario' : 'Agregar Cajero'}
          </button>
        </div>

        {showAddCashierForm && (
          <form
            onSubmit={handleAddCashierSubmit}
            className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-3"
          >
            <div>
              <label
                htmlFor="settings-new-cashier-name"
                className="block text-xs font-semibold text-slate-700"
              >
                Nombre del Cajero *
              </label>
              <input
                id="settings-new-cashier-name"
                type="text"
                required
                value={newCashierName}
                onChange={(e) => {
                  setNewCashierName(e.target.value);
                  setCashierFormError('');
                }}
                placeholder="Ej. Luis Ramírez"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="settings-new-cashier-pin"
                className="block text-xs font-semibold text-slate-700"
              >
                PIN de 4 dígitos *
              </label>
              <div className="relative mt-1">
                <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="settings-new-cashier-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  autoComplete="new-password"
                  required
                  placeholder="••••"
                  value={newCashierPin}
                  onChange={(e) => {
                    setNewCashierPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                    setCashierFormError('');
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 font-mono text-xs tracking-[0.35em] text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="settings-new-cashier-branch"
                className="block text-xs font-semibold text-slate-700"
              >
                Sucursal asignada
              </label>
              <select
                id="settings-new-cashier-branch"
                value={newCashierBranchId}
                onChange={(e) => setNewCashierBranchId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#76B900] focus:outline-none"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            {cashierFormError && (
              <p className="sm:col-span-3 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
                {cashierFormError}
              </p>
            )}

            <div className="sm:col-span-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddCashierForm(false);
                  setCashierFormError('');
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingCashier}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {creatingCashier ? 'Guardando...' : 'Guardar Cajero'}
              </button>
            </div>
          </form>
        )}

        {cashierFormSuccess && (
          <div className="flex items-center gap-1.5 rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] px-3 py-2 text-xs font-medium text-[#3F6212]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
            <span>{cashierFormSuccess}</span>
          </div>
        )}

        {cashiers.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            No hay usuarios internos creados en esta cuenta.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {cashiers.map((user) => {
              const branch = branches.find((b) => b.id === user.branchId);
              const isCurrent = activeCashier?.id === user.id;
              const canDelete = user.role === 'cashier' && !isCurrent;
              return (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        user.role === 'admin'
                          ? 'bg-[#F7FEE7] text-[#558B00] border border-[#84CC16]/40'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">
                        {user.name}
                        {isCurrent && (
                          <span className="ml-1.5 font-semibold text-[#558B00]">(Activo)</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {user.role === 'admin' ? 'Administrador' : 'Cajero'}
                        {branch ? ` · ${branch.name}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-medium text-slate-400">PIN protegido</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void onDeleteCashier(user.id)}
                        aria-label={`Eliminar cajero ${user.name}`}
                        className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-[#76B900]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Datos del comercio</h2>
              <p className="text-xs text-slate-500">
                Sincronizados en la tabla <span className="font-mono">business_settings</span> y usados en recibos de WhatsApp
              </p>
            </div>
          </div>
          <span
            className={`text-[11px] font-semibold ${
              businessSettings.syncStatus === 'synced' ? 'text-[#558B00]' : 'text-amber-700'
            }`}
          >
            {businessSettings.syncStatus === 'synced' ? 'Sincronizado' : 'Pendiente offline'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="settings-business-name" className="block text-xs font-semibold text-slate-700">
              Nombre del comercio *
            </label>
            <input
              id="settings-business-name"
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Comercial 262 Suárez"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="settings-rif" className="block text-xs font-semibold text-slate-700">
              RIF
            </label>
            <input
              id="settings-rif"
              type="text"
              value={rif}
              onChange={(e) => setRif(e.target.value)}
              placeholder="J-00000000-0"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="settings-phone" className="block text-xs font-semibold text-slate-700">
              Teléfono / WhatsApp
            </label>
            <input
              id="settings-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+58 412-5550101"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="settings-rate" className="block text-xs font-semibold text-slate-700">
              Tasa diaria de cambio (Bs / $) *
            </label>
            <input
              id="settings-rate"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={exchangeRateInput}
              onChange={(e) => setExchangeRateInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-bold tabular-nums text-[#558B00] focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="settings-address" className="block text-xs font-semibold text-slate-700">
              Dirección fiscal
            </label>
            <input
              id="settings-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Av. Bolívar, Edif. Comercial Local 4"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>

          {formError && (
            <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {formError}
            </p>
          )}

          {saveMessage && (
            <p className="sm:col-span-2 flex items-center gap-1.5 rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] px-3 py-2 text-xs font-medium text-[#3F6212]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
              {saveMessage}
            </p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-700" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Base de datos local (IndexedDB) y cola de sincronización
              </h2>
              <p className="text-xs text-slate-500">
                Todos los registros se respaldan en <span className="font-mono">sync_records</span> filtrados por tu usuario autenticado
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSyncQueue}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            Ver cola offline ({pendingSyncSummary.total})
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7 font-mono tabular-nums">
          {[
            { label: 'Productos', value: counts.products },
            { label: 'Clientes', value: counts.customers },
            { label: 'Ventas', value: counts.sales },
            { label: 'Turnos', value: counts.shifts },
            { label: 'Movimientos', value: counts.transfers },
            { label: 'Proveedores', value: counts.quotes },
            { label: 'Gastos', value: counts.expenses },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <p className="font-sans text-[11px] font-medium text-slate-500">{stat.label}</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
