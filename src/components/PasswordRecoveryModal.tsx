import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  WifiOff,
  X,
} from 'lucide-react';
import { isSupabaseConfigured, mapAuthErrorMessage, supabase } from '../lib/supabase';

export function hasPasswordRecoveryUrlParams(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';
  } catch {
    return false;
  }
}

export function clearPasswordRecoveryUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;

    if (url.hash) {
      const hashParams = new URLSearchParams(url.hash.slice(1));
      if (
        hashParams.get('type') === 'recovery' ||
        hashParams.has('access_token') ||
        hashParams.has('refresh_token')
      ) {
        url.hash = '';
        changed = true;
      }
    }

    if (url.searchParams.get('type') === 'recovery') {
      url.searchParams.delete('type');
      changed = true;
    }

    if (changed) {
      const cleanPath = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, '', cleanPath || '/');
    }
  } catch {
    // Ignore history API errors in restricted environments
  }
}

interface PasswordRecoveryModalProps {
  userEmail?: string | null;
  isOnline: boolean;
  hasSession: boolean;
  onCompleted: () => void;
  onCancel: () => void;
}

export const PasswordRecoveryModal: React.FC<PasswordRecoveryModalProps> = ({
  userEmail,
  isOnline,
  hasSession,
  onCompleted,
  onCancel,
}) => {
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const handleClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    clearPasswordRecoveryUrl();
    onCancel();
  };

  const handleContinue = () => {
    setNewPassword('');
    setConfirmPassword('');
    clearPasswordRecoveryUrl();
    onCompleted();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase no está configurado en este entorno.');
      return;
    }
    if (!isOnline) {
      setErrorMessage('Se requiere conexión a internet para actualizar tu contraseña.');
      return;
    }
    if (!hasSession) {
      setErrorMessage(
        'El enlace de recuperación ha expirado o no es válido. Solicita un nuevo correo de recuperación.'
      );
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword.length > 128) {
      setErrorMessage('La nueva contraseña no puede superar los 128 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden. Verifícalas e intenta nuevamente.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        const lower = (error.message || '').toLowerCase();
        if (lower.includes('different from the old password') || lower.includes('same password')) {
          setErrorMessage('La nueva contraseña debe ser diferente a la contraseña anterior.');
        } else {
          setErrorMessage(mapAuthErrorMessage(error));
        }
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      clearPasswordRecoveryUrl();
      setSuccessMessage('Tu contraseña se actualizó correctamente.');
    } catch (err) {
      setErrorMessage(mapAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-recovery-title"
      className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-slate-50/95 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#84CC16]/50 bg-[#F7FEE7] text-[#558B00]">
                <KeyRound className="h-4 w-4" />
              </span>
              <h2
                id="password-recovery-title"
                className="text-base font-bold tracking-tight text-slate-900"
              >
                Restablecer contraseña
              </h2>
            </div>
            <p className="mt-1.5 text-xs text-slate-600">
              {userEmail
                ? `Define una nueva contraseña para ${userEmail}.`
                : 'Ingresa y confirma tu nueva contraseña de acceso a Pos 262.'}
            </p>
          </div>

          <button
            type="button"
            onClick={successMessage ? handleContinue : handleClose}
            aria-label="Cerrar recuperación de contraseña"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!isOnline && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Sin conexión a internet. Conéctate para guardar tu nueva contraseña.</span>
          </div>
        )}

        {successMessage ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-[#84CC16]/50 bg-[#F7FEE7] px-3.5 py-3 text-xs text-[#3F6212]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#558B00]" />
              <div>
                <p className="font-semibold">{successMessage}</p>
                <p className="mt-0.5 text-[#3F6212]/90">
                  Ya puedes continuar usando tu cuenta en Pos 262 con tu nueva clave.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#84CC16] py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-[#76B900] cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Continuar a Pos 262</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            {!hasSession && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  No se detectó una sesión de recuperación activa. Si el enlace venció, solicita un
                  nuevo correo de restablecimiento.
                </span>
              </div>
            )}

            <div>
              <label
                htmlFor="recovery-new-password"
                className="mb-1 block text-xs font-semibold text-slate-700"
              >
                Nueva contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="recovery-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={128}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#84CC16] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="recovery-confirm-password"
                className="mb-1 block text-xs font-semibold text-slate-700"
              >
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="recovery-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu nueva contraseña"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={128}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#84CC16] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={
                    showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'
                  }
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !hasSession}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{submitting ? 'Actualizando...' : 'Guardar nueva contraseña'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
