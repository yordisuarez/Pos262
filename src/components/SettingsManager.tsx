import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  KeyRound,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Trash2,
  UserPlus,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type {
  Branch,
  BusinessSettings,
  Cashier,
  CashierPermissions,
  CloudSyncState,
  SubscriptionState,
} from '../types/pos';
import type { PendingSyncSummary } from '../services/syncQueue';
import { buildSubscriptionRenewalWhatsAppUrl } from '../services/subscription';
import {
  CASHIER_PERMISSION_ITEMS,
  DEFAULT_CASHIER_PERMISSIONS,
  countActivePermissions,
  normalizeCashierPermissions,
  toggleCashierPermission,
} from '../services/permissions';

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
  visibleBranches: Branch[];
  activeBranchId: string;
  isBranchLocked?: boolean;
  onSelectBranch: (branchId: string) => void;
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
  onSignOutCloud: () => Promise<void>;
  onOpenSyncQueue: () => void;
  onCreateCashier: (params: {
    name: string;
    pin: string;
    branchId: string;
    permissions: CashierPermissions;
  }) => Promise<Cashier>;
  onUpdateCashier: (cashier: Cashier) => Promise<void>;
  onDeleteCashier: (cashierId: string) => Promise<void>;
  onCreateBranch: (params: {
    name: string;
    code: string;
    address: string;
    phone: string;
  }) => Promise<Branch>;
  onUpdateBranch: (branch: Branch) => Promise<void>;
  onToggleBranchActive: (branchId: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteBranch: (branchId: string) => Promise<{ ok: boolean; error?: string }>;
  onResetOperationalData: () => Promise<{
    ok: boolean;
    cloudCleared: boolean;
    errorMessage?: string;
  }>;
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
  visibleBranches,
  activeBranchId,
  isBranchLocked = false,
  onSelectBranch,
  counts,
  onSaveBusinessSettings,
  onManualSync,
  onSignOutCloud,
  onOpenSyncQueue,
  onCreateCashier,
  onUpdateCashier,
  onDeleteCashier,
  onCreateBranch,
  onUpdateBranch,
  onToggleBranchActive,
  onDeleteBranch,
  onResetOperationalData,
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

  // Internal cashier creation & permissions editing state
  const [showAddCashierForm, setShowAddCashierForm] = useState<boolean>(false);
  const [newCashierName, setNewCashierName] = useState<string>('');
  const [newCashierPin, setNewCashierPin] = useState<string>('');
  const [newCashierBranchId, setNewCashierBranchId] = useState<string>(
    activeBranchId || branches[0]?.id || 'branch-principal'
  );
  const [newCashierPermissions, setNewCashierPermissions] = useState<CashierPermissions>({
    ...DEFAULT_CASHIER_PERMISSIONS,
  });
  const [cashierFormError, setCashierFormError] = useState<string>('');
  const [cashierFormSuccess, setCashierFormSuccess] = useState<string>('');
  const [creatingCashier, setCreatingCashier] = useState<boolean>(false);

  const [editingCashierId, setEditingCashierId] = useState<string | null>(null);
  const [editCashierBranchId, setEditCashierBranchId] = useState<string>('');
  const [editCashierPermissions, setEditCashierPermissions] = useState<CashierPermissions>({
    ...DEFAULT_CASHIER_PERMISSIONS,
  });
  const [savingCashierEdit, setSavingCashierEdit] = useState<boolean>(false);

  // Branch CRUD state
  const [showAddBranchForm, setShowAddBranchForm] = useState<boolean>(false);
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [newBranchCode, setNewBranchCode] = useState<string>('');
  const [newBranchAddress, setNewBranchAddress] = useState<string>('');
  const [newBranchPhone, setNewBranchPhone] = useState<string>('');
  const [creatingBranch, setCreatingBranch] = useState<boolean>(false);

  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editBranchName, setEditBranchName] = useState<string>('');
  const [editBranchCode, setEditBranchCode] = useState<string>('');
  const [editBranchAddress, setEditBranchAddress] = useState<string>('');
  const [editBranchPhone, setEditBranchPhone] = useState<string>('');
  const [savingBranchEdit, setSavingBranchEdit] = useState<boolean>(false);
  const [confirmDeleteBranchId, setConfirmDeleteBranchId] = useState<string | null>(null);
  const [branchFeedback, setBranchFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Operational data reset (double confirmation)
  const [resetPanelOpen, setResetPanelOpen] = useState<boolean>(false);
  const [resetConfirmText, setResetConfirmText] = useState<string>('');
  const [resettingData, setResettingData] = useState<boolean>(false);
  const [resetFeedback, setResetFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    setBusinessName(businessSettings.businessName);
    setRif(businessSettings.rif);
    setPhone(businessSettings.phone);
    setAddress(businessSettings.address);
    setExchangeRateInput(businessSettings.exchangeRate.toFixed(2));
  }, [businessSettings]);

  useEffect(() => {
    if (branches.length > 0 && !branches.some((b) => b.id === newCashierBranchId)) {
      setNewCashierBranchId(branches[0].id);
    }
  }, [branches, newCashierBranchId]);

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
        branchId: newCashierBranchId || activeBranchId || branches[0]?.id || 'branch-principal',
        permissions: normalizeCashierPermissions(newCashierPermissions, 'cashier'),
      });
      setNewCashierName('');
      setNewCashierPin('');
      setNewCashierPermissions({ ...DEFAULT_CASHIER_PERMISSIONS });
      setCashierFormSuccess(`Cajero "${trimmedName}" creado con sus permisos configurados.`);
      setShowAddCashierForm(false);
    } finally {
      setCreatingCashier(false);
    }
  };

  const openEditCashierPermissions = (user: Cashier) => {
    setCashierFormError('');
    setCashierFormSuccess('');
    setEditingCashierId(user.id);
    setEditCashierBranchId(user.branchId || branches[0]?.id || 'branch-principal');
    setEditCashierPermissions(normalizeCashierPermissions(user.permissions, 'cashier'));
  };

  const handleSaveCashierPermissions = async (user: Cashier) => {
    setSavingCashierEdit(true);
    setCashierFormError('');
    setCashierFormSuccess('');
    try {
      await onUpdateCashier({
        ...user,
        branchId: editCashierBranchId || user.branchId,
        permissions: normalizeCashierPermissions(editCashierPermissions, 'cashier'),
      });
      setEditingCashierId(null);
      setCashierFormSuccess(`Permisos y sucursal de "${user.name}" actualizados correctamente.`);
    } finally {
      setSavingCashierEdit(false);
    }
  };

  const handleCreateBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBranchFeedback(null);

    const trimmedName = newBranchName.trim();
    const trimmedCode =
      newBranchCode.trim().toUpperCase() || `SUC-${String(branches.length + 1).padStart(2, '0')}`;

    if (!trimmedName) {
      setBranchFeedback({ type: 'err', text: 'Ingresa el nombre de la sucursal.' });
      return;
    }

    setCreatingBranch(true);
    try {
      const created = await onCreateBranch({
        name: trimmedName,
        code: trimmedCode,
        address: newBranchAddress.trim(),
        phone: newBranchPhone.trim(),
      });
      setNewBranchName('');
      setNewBranchCode('');
      setNewBranchAddress('');
      setNewBranchPhone('');
      setShowAddBranchForm(false);
      setBranchFeedback({
        type: 'ok',
        text: `Sucursal "${created.name} (${created.code})" creada correctamente.`,
      });
    } finally {
      setCreatingBranch(false);
    }
  };

  const startEditBranch = (branch: Branch) => {
    setConfirmDeleteBranchId(null);
    setBranchFeedback(null);
    setEditingBranchId(branch.id);
    setEditBranchName(branch.name);
    setEditBranchCode(branch.code);
    setEditBranchAddress(branch.address);
    setEditBranchPhone(branch.phone);
  };

  const handleSaveBranchEdit = async (branch: Branch) => {
    setBranchFeedback(null);
    const trimmedName = editBranchName.trim();
    const trimmedCode = editBranchCode.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) {
      setBranchFeedback({
        type: 'err',
        text: 'El nombre y el código de la sucursal son obligatorios.',
      });
      return;
    }

    setSavingBranchEdit(true);
    try {
      await onUpdateBranch({
        ...branch,
        name: trimmedName,
        code: trimmedCode,
        address: editBranchAddress.trim(),
        phone: editBranchPhone.trim(),
      });
      setEditingBranchId(null);
      setBranchFeedback({
        type: 'ok',
        text: `Sucursal actualizada: "${trimmedName} (${trimmedCode})". Stock, turnos y traslados intactos.`,
      });
    } finally {
      setSavingBranchEdit(false);
    }
  };

  const handleToggleBranch = async (branch: Branch) => {
    setBranchFeedback(null);
    const result = await onToggleBranchActive(branch.id);
    if (!result.ok && result.error) {
      setBranchFeedback({ type: 'err', text: result.error });
    } else {
      setBranchFeedback({
        type: 'ok',
        text: branch.isActive
          ? `Sucursal "${branch.name}" desactivada.`
          : `Sucursal "${branch.name}" activada nuevamente.`,
      });
    }
  };

  const handleConfirmDeleteBranch = async (branch: Branch) => {
    setBranchFeedback(null);
    const result = await onDeleteBranch(branch.id);
    setConfirmDeleteBranchId(null);
    if (!result.ok && result.error) {
      setBranchFeedback({ type: 'err', text: result.error });
    } else {
      setBranchFeedback({
        type: 'ok',
        text: `Sucursal "${branch.name} (${branch.code})" eliminada.`,
      });
    }
  };

  const handleExecuteOperationalReset = async () => {
    if (resetConfirmText.trim().toUpperCase() !== 'BORRAR') return;
    setResettingData(true);
    setResetFeedback(null);
    try {
      const result = await onResetOperationalData();
      if (result.ok) {
        setResetPanelOpen(false);
        setResetConfirmText('');
        setResetFeedback({
          type: 'ok',
          text: result.cloudCleared
            ? 'Borrado total completado en este dispositivo y en Supabase. Todos los contadores quedaron en 0 y los datos eliminados no volverán a aparecer (cuenta y suscripción intactas).'
            : 'Borrado total aplicado localmente (contadores en 0). La limpieza en Supabase se completará automáticamente al reconectar.',
        });
      } else {
        setResetFeedback({
          type: 'err',
          text:
            result.errorMessage ||
            'Se vaciaron los datos locales, pero ocurrió un error al limpiar la nube. Se reintentará al sincronizar.',
        });
      }
    } finally {
      setResettingData(false);
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

  if (activeCashier?.role !== 'admin') {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <label
              htmlFor="settings-active-branch-select"
              className="block text-xs font-bold text-slate-900"
            >
              Sucursal activa
            </label>
            <div className="relative mt-1.5 flex items-center">
              {isBranchLocked ? (
                <Lock className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
              ) : (
                <Building2 className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
              )}
              <select
                id="settings-active-branch-select"
                aria-label="Seleccionar sucursal"
                value={activeBranchId}
                disabled={isBranchLocked}
                title={
                  isBranchLocked
                    ? 'Sucursal fija asignada a este cajero'
                    : 'Seleccionar sucursal activa'
                }
                onChange={(e) => onSelectBranch(e.target.value)}
                className={`w-full truncate rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs font-medium focus:border-[#76B900] focus:bg-white focus:outline-none ${
                  isBranchLocked
                    ? 'bg-slate-100 text-slate-600 cursor-not-allowed'
                    : 'bg-slate-50 text-slate-900 cursor-pointer'
                }`}
              >
                {visibleBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenSyncQueue}
              title={
                cloudUser
                  ? `Cuenta nube: ${cloudUser.email} · Clic para ver cola de sincronización`
                  : 'Clic para ver cola de sincronización local'
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                cloudSyncState === 'offline'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/70'
                  : cloudSyncState === 'synced'
                  ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212] hover:bg-[#ECFCCB]'
                  : cloudSyncState === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100/70'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
              }`}
            >
              {cloudSyncState === 'offline' ? (
                <WifiOff className="h-3.5 w-3.5 text-amber-600" />
              ) : cloudSyncState === 'syncing' ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#76B900]" />
              ) : cloudSyncState === 'local' ? (
                <CloudOff className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <Cloud
                  className={`h-3.5 w-3.5 ${
                    cloudSyncState === 'error' ? 'text-red-500' : 'text-[#76B900]'
                  }`}
                />
              )}
              <span>Cola de sincronización</span>
              <span className="font-mono font-bold tabular-nums">
                ({pendingSyncSummary.total})
              </span>
            </button>
          </div>
        </div>
      </section>

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
                  title="Cierra la sesión y vuelve al inicio con correo y contraseña sin borrar los datos del comercio"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {signingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
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
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#76B900]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Sucursales y tiendas ({branches.length})
              </h2>
              <p className="text-xs text-slate-500">
                Crea, edita nombre/código, desactiva o elimina sucursales sin perder stock ni historial asociado
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowAddBranchForm((prev) => !prev);
              setBranchFeedback(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            {showAddBranchForm ? 'Cerrar formulario' : 'Nueva sucursal'}
          </button>
        </div>

        {showAddBranchForm && (
          <form
            onSubmit={handleCreateBranchSubmit}
            className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-2"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Nombre de la sucursal *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Sucursal Oeste"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Código *</label>
              <input
                type="text"
                required
                placeholder={`Ej. SUC-${String(branches.length + 1).padStart(2, '0')}`}
                value={newBranchCode}
                onChange={(e) => setNewBranchCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-slate-900 focus:border-[#76B900] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Dirección</label>
              <input
                type="text"
                placeholder="Av. Principal, Local 2"
                value={newBranchAddress}
                onChange={(e) => setNewBranchAddress(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Teléfono</label>
              <input
                type="text"
                placeholder="+58 412-0000000"
                value={newBranchPhone}
                onChange={(e) => setNewBranchPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddBranchForm(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingBranch}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                {creatingBranch ? 'Guardando...' : 'Guardar sucursal'}
              </button>
            </div>
          </form>
        )}

        {branchFeedback && (
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
              branchFeedback.type === 'ok'
                ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212]'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {branchFeedback.type === 'ok' && (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
            )}
            <span>{branchFeedback.text}</span>
          </div>
        )}

        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {branches.map((branch) => {
            const isEditing = editingBranchId === branch.id;
            const isConfirmingDelete = confirmDeleteBranchId === branch.id;
            const isSelected = activeBranchId === branch.id;

            if (isEditing) {
              return (
                <li key={branch.id} className="bg-[#F7FEE7]/60 p-3.5">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        value={editBranchName}
                        onChange={(e) => setEditBranchName(e.target.value)}
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Código *
                      </label>
                      <input
                        type="text"
                        value={editBranchCode}
                        onChange={(e) => setEditBranchCode(e.target.value)}
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs uppercase text-slate-900 focus:border-[#76B900] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Dirección
                      </label>
                      <input
                        type="text"
                        value={editBranchAddress}
                        onChange={(e) => setEditBranchAddress(e.target.value)}
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Teléfono
                      </label>
                      <input
                        type="text"
                        value={editBranchPhone}
                        onChange={(e) => setEditBranchPhone(e.target.value)}
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingBranchId(null)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={savingBranchEdit}
                      onClick={() => void handleSaveBranchEdit(branch)}
                      className="inline-flex items-center gap-1 rounded-md bg-[#84CC16] px-3 py-1 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:opacity-50 cursor-pointer"
                    >
                      <Check className="h-3 w-3" />
                      {savingBranchEdit ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </li>
              );
            }

            return (
              <li
                key={branch.id}
                className="flex flex-col gap-2 px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">
                    {branch.name}{' '}
                    <span className="font-mono font-semibold text-slate-600">({branch.code})</span>
                    {isSelected && (
                      <span className="ml-1.5 font-semibold text-[#558B00]">· En caja</span>
                    )}
                    {!branch.isActive && (
                      <span className="ml-1.5 font-semibold text-amber-700">· Inactiva</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {branch.address || 'Sin dirección'}
                    {branch.phone ? ` · ${branch.phone}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {isConfirmingDelete ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleConfirmDeleteBranch(branch)}
                        className="rounded bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700 cursor-pointer"
                      >
                        Confirmar eliminar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteBranchId(null)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      {!isSelected && branch.isActive && !isBranchLocked && (
                        <button
                          type="button"
                          onClick={() => onSelectBranch(branch.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#84CC16]/50 bg-[#F7FEE7] px-2 py-1 text-[11px] font-semibold text-[#3F6212] hover:bg-[#ECFCCB] cursor-pointer"
                        >
                          Usar en caja
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startEditBranch(branch)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#76B900] hover:text-slate-900 cursor-pointer"
                      >
                        <Pencil className="h-3 w-3" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleBranch(branch)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <Power className="h-3 w-3" />
                        {branch.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                      {branches.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBranchId(branch.id)}
                          aria-label={`Eliminar sucursal ${branch.name}`}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3 space-y-2 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-800">
                  Permisos del Cajero (por defecto restrictivos)
                </p>
                <span className="font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
                  {countActivePermissions(newCashierPermissions)}/{CASHIER_PERMISSION_ITEMS.length} activos
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CASHIER_PERMISSION_ITEMS.map((perm) => {
                  const checked = newCashierPermissions[perm.key];
                  return (
                    <label
                      key={perm.key}
                      className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer ${
                        checked
                          ? 'border-[#76B900] bg-[#F7FEE7]/70'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setNewCashierPermissions((prev) =>
                            toggleCashierPermission(prev, perm.key, e.target.checked)
                          )
                        }
                        className="mt-0.5 h-3.5 w-3.5 rounded accent-[#76B900] cursor-pointer"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900">{perm.label}</span>
                        <span className="block text-[11px] leading-snug text-slate-500">
                          {perm.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
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
                  setNewCashierPermissions({ ...DEFAULT_CASHIER_PERMISSIONS });
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
              const isEditingThis = editingCashierId === user.id;
              const canDelete = user.role === 'cashier' && !isCurrent;
              const activePermCount =
                user.role === 'admin'
                  ? CASHIER_PERMISSION_ITEMS.length
                  : countActivePermissions(user.permissions);

              return (
                <li key={user.id} className="px-3.5 py-2.5 text-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                          {user.role === 'admin' ? 'Administrador · Acceso total' : 'Cajero'}
                          {branch ? ` · ${branch.name}` : ''}
                          {user.role === 'cashier' && (
                            <span className="font-mono tabular-nums">
                              {' '}
                              · {activePermCount}/{CASHIER_PERMISSION_ITEMS.length} permisos
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-medium text-slate-400">PIN protegido</span>
                      {user.role === 'cashier' && (
                        <button
                          type="button"
                          onClick={() =>
                            isEditingThis
                              ? setEditingCashierId(null)
                              : openEditCashierPermissions(user)
                          }
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                            isEditingThis
                              ? 'border-[#76B900] bg-[#F7FEE7] text-[#3F6212]'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-[#76B900] hover:text-slate-900'
                          }`}
                        >
                          <SlidersHorizontal className="h-3 w-3" />
                          {isEditingThis ? 'Cerrar' : 'Permisos'}
                        </button>
                      )}
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
                  </div>

                  {isEditingThis && user.role === 'cashier' && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900">
                            Configurar permisos de {user.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Este cajero operará exclusivamente en su sucursal asignada sin poder cambiarse de tienda.
                          </p>
                        </div>
                        <div className="shrink-0 sm:w-56">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Sucursal única asignada
                          </label>
                          <select
                            value={editCashierBranchId}
                            onChange={(e) => setEditCashierBranchId(e.target.value)}
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:outline-none"
                          >
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({b.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {CASHIER_PERMISSION_ITEMS.map((perm) => {
                          const checked = editCashierPermissions[perm.key];
                          return (
                            <label
                              key={perm.key}
                              className={`flex items-start gap-2.5 rounded-lg border p-2 text-xs transition-colors cursor-pointer ${
                                checked
                                  ? 'border-[#76B900] bg-[#F7FEE7]/70'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setEditCashierPermissions((prev) =>
                                    toggleCashierPermission(prev, perm.key, e.target.checked)
                                  )
                                }
                                className="mt-0.5 h-3.5 w-3.5 rounded accent-[#76B900] cursor-pointer"
                              />
                              <span className="min-w-0">
                                <span className="block font-semibold text-slate-900">
                                  {perm.label}
                                </span>
                                <span className="block text-[11px] leading-snug text-slate-500">
                                  {perm.description}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCashierId(null)}
                          className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={savingCashierEdit}
                          onClick={() => void handleSaveCashierPermissions(user)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#84CC16] px-3 py-1 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:opacity-50 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {savingCashierEdit ? 'Guardando...' : 'Guardar permisos'}
                        </button>
                      </div>
                    </div>
                  )}
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
            <label
              htmlFor="settings-business-name"
              className="block text-xs font-semibold text-slate-700"
            >
              Nombre del comercio *
            </label>
            <input
              id="settings-business-name"
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Comercial"
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
            <label
              htmlFor="settings-address"
              className="block text-xs font-semibold text-slate-700"
            >
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

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
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

        <div className="rounded-lg border border-red-200 bg-red-50/50 p-3.5 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  Borrar todos los datos y dejar en blanco
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Elimina permanentemente todos los productos/stock, clientes, ventas, cuentas por cobrar, turnos/cierres, movimientos, cotizaciones de proveedores, gastos y cola pendiente (en este dispositivo y en Supabase), dejando una sola sucursal principal limpia sin datos demo.{' '}
                  <strong className="text-slate-800">
                    Conserva únicamente tu cuenta, suscripción activa y usuarios internos.
                  </strong>
                </p>
              </div>
            </div>

            {!resetPanelOpen && (
              <button
                type="button"
                onClick={() => {
                  setResetPanelOpen(true);
                  setResetConfirmText('');
                  setResetFeedback(null);
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Borrar todo y dejar en blanco
              </button>
            )}
          </div>

          {resetPanelOpen && (
            <div className="rounded-lg border border-red-200 bg-white p-3 space-y-2.5">
              <p className="text-xs font-semibold text-red-700">
                Confirmación doble requerida: se eliminarán permanentemente {counts.products}{' '}
                productos, {counts.customers} clientes, {counts.sales} ventas, {counts.shifts}{' '}
                turnos, {counts.transfers} movimientos, {counts.quotes} cotizaciones de proveedores y{' '}
                {counts.expenses} gastos. Todos los contadores quedarán en 0.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="Escribe BORRAR para confirmar"
                  className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 font-mono text-xs font-bold uppercase text-slate-900 focus:border-red-500 focus:bg-white focus:outline-none"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setResetPanelOpen(false);
                      setResetConfirmText('');
                    }}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={
                      resettingData || resetConfirmText.trim().toUpperCase() !== 'BORRAR'
                    }
                    onClick={() => void handleExecuteOperationalReset()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {resettingData ? 'Borrando todo...' : 'Confirmar borrado total'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {resetFeedback && (
            <p
              className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium ${
                resetFeedback.type === 'ok'
                  ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212]'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {resetFeedback.type === 'ok' && (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
              )}
              <span>{resetFeedback.text}</span>
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
