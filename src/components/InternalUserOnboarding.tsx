import React, { useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Plus,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  ArrowRight,
} from 'lucide-react';
import type { Branch, Cashier, CashierPermissions } from '../types/pos';
import {
  CASHIER_PERMISSION_ITEMS,
  DEFAULT_CASHIER_PERMISSIONS,
  normalizeCashierPermissions,
  toggleCashierPermission,
} from '../services/permissions';

interface InternalUserOnboardingProps {
  step: 'admin' | 'cashiers';
  branches: Branch[];
  activeBranchId: string;
  cashiers: Cashier[];
  businessName: string;
  onCreateAdmin: (params: { name: string; pin: string; branchId: string }) => Promise<Cashier>;
  onCreateCashier: (params: {
    name: string;
    pin: string;
    branchId: string;
    permissions: CashierPermissions;
  }) => Promise<Cashier>;
  onContinueToSystem: () => void;
}

const PIN_PATTERN = /^\d{4}$/;

export const InternalUserOnboarding: React.FC<InternalUserOnboardingProps> = ({
  step,
  branches,
  activeBranchId,
  cashiers,
  businessName,
  onCreateAdmin,
  onCreateCashier,
  onContinueToSystem,
}) => {
  const defaultBranchId = activeBranchId || branches[0]?.id || 'branch-principal';

  // Step 1: Admin creation form state
  const [adminName, setAdminName] = useState<string>('');
  const [adminPin, setAdminPin] = useState<string>('');
  const [adminError, setAdminError] = useState<string>('');
  const [savingAdmin, setSavingAdmin] = useState<boolean>(false);

  // Step 2: Optional Cashier creation state
  const [showCashierForm, setShowCashierForm] = useState<boolean>(false);
  const [cashierName, setCashierName] = useState<string>('');
  const [cashierPin, setCashierPin] = useState<string>('');
  const [cashierBranchId, setCashierBranchId] = useState<string>(defaultBranchId);
  const [cashierPermissions, setCashierPermissions] = useState<CashierPermissions>({
    ...DEFAULT_CASHIER_PERMISSIONS,
  });
  const [cashierError, setCashierError] = useState<string>('');
  const [cashierFeedback, setCashierFeedback] = useState<string>('');
  const [savingCashier, setSavingCashier] = useState<boolean>(false);

  const handlePinDigits = (raw: string): string => raw.replace(/\D/g, '').slice(0, 4);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    const trimmedName = adminName.trim();
    if (!trimmedName) {
      setAdminError('Ingresa el nombre del Administrador.');
      return;
    }
    if (!PIN_PATTERN.test(adminPin)) {
      setAdminError('El PIN de acceso debe tener exactamente 4 dígitos numéricos.');
      return;
    }

    setSavingAdmin(true);
    try {
      await onCreateAdmin({
        name: trimmedName,
        pin: adminPin,
        branchId: defaultBranchId,
      });
      setAdminName('');
      setAdminPin('');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleCashierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashierError('');
    setCashierFeedback('');

    const trimmedName = cashierName.trim();
    if (!trimmedName) {
      setCashierError('Ingresa el nombre del Cajero.');
      return;
    }
    if (!PIN_PATTERN.test(cashierPin)) {
      setCashierError('El PIN de acceso debe tener exactamente 4 dígitos numéricos.');
      return;
    }

    setSavingCashier(true);
    try {
      await onCreateCashier({
        name: trimmedName,
        pin: cashierPin,
        branchId: cashierBranchId || defaultBranchId,
        permissions: normalizeCashierPermissions(cashierPermissions, 'cashier'),
      });
      setCashierName('');
      setCashierPin('');
      setCashierPermissions({ ...DEFAULT_CASHIER_PERMISSIONS });
      setCashierFeedback(`Cajero "${trimmedName}" agregado con permisos configurados.`);
    } finally {
      setSavingCashier(false);
    }
  };

  const createdAdmins = cashiers.filter((u) => u.role === 'admin');
  const createdCashiers = cashiers.filter((u) => u.role === 'cashier');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
          <div>
            <p className="text-base font-extrabold tracking-tight text-slate-900">
              Pos <span className="text-[#558B00]">262</span>
            </p>
            <p className="text-xs text-slate-500 truncate max-w-[260px]">
              {businessName || 'Configuración inicial de usuarios'}
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] text-[#558B00]">
            {step === 'admin' ? <ShieldCheck className="h-4 w-4" /> : <Users className="h-4 w-4" />}
          </div>
        </div>

        {step === 'admin' ? (
          <div className="mt-4 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Configura tu cuenta: Crea tu usuario Administrador para comenzar
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Tu cuenta inicia sin usuarios precargados. Crea primero el perfil del Administrador con su PIN privado de 4 dígitos.
              </p>
            </div>

            <form onSubmit={handleAdminSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="onboarding-admin-name"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Nombre del Administrador *
                </label>
                <input
                  id="onboarding-admin-name"
                  type="text"
                  required
                  autoFocus
                  value={adminName}
                  onChange={(e) => {
                    setAdminName(e.target.value);
                    setAdminError('');
                  }}
                  placeholder="Ej. María González"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="onboarding-admin-role"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Rol
                </label>
                <input
                  id="onboarding-admin-role"
                  type="text"
                  value="Administrador"
                  readOnly
                  disabled
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 cursor-not-allowed"
                />
              </div>

              <div>
                <label
                  htmlFor="onboarding-admin-pin"
                  className="block text-xs font-semibold text-slate-700"
                >
                  PIN de acceso (4 dígitos) *
                </label>
                <div className="relative mt-1">
                  <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="onboarding-admin-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="new-password"
                    required
                    placeholder="••••"
                    value={adminPin}
                    onChange={(e) => {
                      setAdminPin(handlePinDigits(e.target.value));
                      setAdminError('');
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 font-mono text-sm tracking-[0.35em] text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  El PIN permanece oculto y se solicitará al cambiar de usuario en caja.
                </p>
              </div>

              {adminError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {adminError}
                </p>
              )}

              <button
                type="submit"
                disabled={savingAdmin}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
              >
                <UserCheck className="h-3.5 w-3.5" />
                {savingAdmin ? 'Guardando Administrador...' : 'Crear Administrador'}
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#76B900]" />
              <div className="text-xs text-[#3F6212]">
                <p className="font-bold">Administrador creado correctamente</p>
                {createdAdmins[0] && (
                  <p className="mt-0.5 text-[11px]">
                    {createdAdmins[0].name} · Administrador
                  </p>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-900">
                ¿Deseas agregar Cajeros ahora?
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Puedes crear uno o varios perfiles de Cajero ahora, o hacerlo más adelante desde Configuración.
              </p>
            </div>

            {createdCashiers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Cajeros agregados ({createdCashiers.length})
                </p>
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {createdCashiers.map((c) => {
                    const branch = branches.find((b) => b.id === c.branchId);
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
                      >
                        <span className="font-semibold text-slate-900">{c.name}</span>
                        <span className="text-[11px] font-medium text-slate-500">
                          Cajero{branch ? ` · ${branch.name}` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {showCashierForm ? (
              <form
                onSubmit={handleCashierSubmit}
                className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-900">Nuevo Cajero</p>
                  <span className="text-[11px] font-semibold text-slate-500">Rol: Cajero</span>
                </div>

                <div>
                  <label
                    htmlFor="onboarding-cashier-name"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Nombre del Cajero *
                  </label>
                  <input
                    id="onboarding-cashier-name"
                    type="text"
                    required
                    autoFocus
                    value={cashierName}
                    onChange={(e) => {
                      setCashierName(e.target.value);
                      setCashierError('');
                    }}
                    placeholder="Ej. Luis Ramírez"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="onboarding-cashier-pin"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      PIN de 4 dígitos *
                    </label>
                    <div className="relative mt-1">
                      <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        id="onboarding-cashier-pin"
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        autoComplete="new-password"
                        required
                        placeholder="••••"
                        value={cashierPin}
                        onChange={(e) => {
                          setCashierPin(handlePinDigits(e.target.value));
                          setCashierError('');
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 font-mono text-xs tracking-[0.35em] text-slate-900 focus:border-[#76B900] focus:outline-none"
                      />
                    </div>
                  </div>

                  {branches.length > 0 && (
                    <div>
                      <label
                        htmlFor="onboarding-cashier-branch"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Sucursal
                      </label>
                      <select
                        id="onboarding-cashier-branch"
                        value={cashierBranchId}
                        onChange={(e) => setCashierBranchId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#76B900] focus:outline-none"
                      >
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 border-t border-slate-200 pt-2.5">
                  <p className="text-[11px] font-semibold text-slate-700">
                    Permisos iniciales (por defecto restrictivos)
                  </p>
                  <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                    {CASHIER_PERMISSION_ITEMS.map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={cashierPermissions[perm.key]}
                          onChange={(e) =>
                            setCashierPermissions((prev) =>
                              toggleCashierPermission(prev, perm.key, e.target.checked)
                            )
                          }
                          className="h-3.5 w-3.5 rounded accent-[#76B900] cursor-pointer"
                        />
                        <span className="font-medium">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {cashierError && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                    {cashierError}
                  </p>
                )}

                {cashierFeedback && (
                  <p className="rounded-md border border-[#84CC16]/40 bg-[#F7FEE7] px-2.5 py-1.5 text-xs font-medium text-[#3F6212]">
                    {cashierFeedback}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingCashier}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#76B900] bg-white px-3 py-2 text-xs font-bold text-[#3F6212] hover:bg-[#F7FEE7] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {savingCashier ? 'Guardando...' : 'Guardar Cajero'}
                </button>
              </form>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {!showCashierForm && (
                <button
                  type="button"
                  onClick={() => setShowCashierForm(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-800 hover:border-[#76B900] hover:bg-[#F7FEE7]/50 transition-colors cursor-pointer"
                >
                  <UserPlus className="h-3.5 w-3.5 text-[#558B00]" />
                  Agregar Cajero
                </button>
              )}

              <button
                type="button"
                onClick={onContinueToSystem}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-2.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer ${
                  showCashierForm ? 'sm:col-span-2' : ''
                }`}
              >
                Continuar al sistema
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
