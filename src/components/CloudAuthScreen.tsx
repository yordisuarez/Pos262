import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MessageCircle,
  Sparkles,
  Store,
  WifiOff,
  X,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { mapAuthErrorMessage, supabase } from '../lib/supabase';
import { ensureTrialSubscription } from '../services/subscription';

interface CloudAuthScreenProps {
  mode?: 'fullscreen' | 'modal';
  isOnline: boolean;
  defaultBusinessName?: string;
  onAuthSuccess: (user: User, businessName?: string) => void;
  onClose?: () => void;
}

const GENERIC_BUSINESS_NAME = 'Comercio';

export const CloudAuthScreen: React.FC<CloudAuthScreenProps> = ({
  mode = 'fullscreen',
  isOnline,
  onAuthSuccess,
  onClose,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [infoMessage, setInfoMessage] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setInfoMessage('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Ingresa un correo electrónico válido.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (!isOnline) {
      setErrorMessage(
        'Sin conexión a internet. Conéctate a la red para iniciar sesión o crear tu cuenta.'
      );
      return;
    }

    setSubmitting(true);
    try {
      if (authTab === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          setErrorMessage(mapAuthErrorMessage(error));
          return;
        }
        if (data.user) {
          onAuthSuccess(data.user, GENERIC_BUSINESS_NAME);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              business_name: GENERIC_BUSINESS_NAME,
            },
          },
        });
        if (error) {
          setErrorMessage(mapAuthErrorMessage(error));
          return;
        }

        if (data.user) {
          try {
            await ensureTrialSubscription(data.user.id);
          } catch {
            // Si la confirmación de correo está pendiente, la prueba se activa al iniciar sesión
          }
        }

        if (data.session && data.user) {
          onAuthSuccess(data.user, GENERIC_BUSINESS_NAME);
        } else {
          setInfoMessage(
            'Cuenta creada con 7 días de prueba gratis. Revisa tu correo para confirmar el registro y luego inicia sesión.'
          );
          setAuthTab('login');
        }
      }
    } catch (err) {
      setErrorMessage(mapAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const card = (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-slate-900">
              Pos <span className="text-[#558B00]">262</span>
            </span>
            <span className="text-xs font-medium text-slate-400">·</span>
            <span className="text-xs font-semibold text-slate-600">Nube de Comercio</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Sincroniza ventas, inventario, clientes y tasa entre tus dispositivos.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <a
            href="https://whatsapp.com/channel/0029Vb8vD7WKmCPIZ4dZ5R3e"
            target="_blank"
            rel="noopener noreferrer"
            title="Canal oficial de WhatsApp Pos 262"
            className="inline-flex items-center gap-1 rounded-md border border-[#84CC16]/60 bg-[#F7FEE7] px-2.5 py-1 text-[11px] font-semibold text-[#3F6212] transition-colors hover:border-[#84CC16]"
          >
            <MessageCircle className="h-3.5 w-3.5 text-[#558B00]" />
            <span>WhatsApp</span>
          </a>

          {mode === 'modal' && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar acceso a la nube"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!isOnline && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Sin conexión a internet. Se requiere conexión para iniciar sesión o registrar tu comercio.
          </span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button
          type="button"
          onClick={() => {
            setAuthTab('login');
            setErrorMessage('');
            setInfoMessage('');
          }}
          className={`rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            authTab === 'login'
              ? 'bg-[#84CC16] text-slate-950'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthTab('register');
            setErrorMessage('');
            setInfoMessage('');
          }}
          className={`rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            authTab === 'register'
              ? 'bg-[#84CC16] text-slate-950'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Crear cuenta
        </button>
      </div>

      {authTab === 'register' && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-[#84CC16]/45 bg-[#F7FEE7] px-3 py-2.5 text-xs text-[#3F6212]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#76B900]" />
            <p className="font-semibold leading-snug">
              ¡Comienza con 7 días GRATIS de prueba! Acceso total sin compromiso.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-slate-600">
                  <Calendar className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-2.5">
                <p className="text-xs font-bold text-slate-900">Plan Mensual</p>
                <p className="mt-1 font-mono text-base font-extrabold tracking-tight text-slate-900 tabular-nums">
                  $10 <span className="font-sans text-[11px] font-medium text-slate-500">/ mes</span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Pago mensual flexible</p>
              </div>
            </div>

            <div className="relative flex flex-col justify-between rounded-lg border-2 border-[#84CC16] bg-[#F7FEE7]/50 p-3">
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#84CC16] text-slate-950">
                  <Crown className="h-3.5 w-3.5" />
                </span>
                <span className="rounded bg-[#84CC16] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-950">
                  Recomendado
                </span>
              </div>
              <div className="mt-2.5">
                <p className="text-xs font-bold text-slate-900">Plan Anual</p>
                <p className="mt-1 font-mono text-base font-extrabold tracking-tight text-slate-900 tabular-nums">
                  $60 <span className="font-sans text-[11px] font-medium text-slate-500">/ año</span>
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-[#3F6212]">Ahorra $60 al año</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {authTab === 'register' && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-700">Tipo de cuenta</p>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
              <Store className="h-4 w-4 shrink-0 text-[#558B00]" />
              <span>{GENERIC_BUSINESS_NAME}</span>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Correo electrónico
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#84CC16] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete={authTab === 'register' ? 'new-password' : 'current-password'}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#84CC16] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        {infoMessage && (
          <div className="rounded-lg border border-lime-300 bg-[#F7FEE7] px-3 py-2 text-xs text-[#3F6212]">
            {infoMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#84CC16] py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-[#76B900] disabled:opacity-60 cursor-pointer"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>
            {submitting
              ? 'Procesando...'
              : authTab === 'register'
              ? 'Registrar comercio en la nube'
              : 'Iniciar sesión'}
          </span>
        </button>
      </form>
    </div>
  );

  if (mode === 'modal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs">
        {card}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090D16] p-4">
      {card}
    </div>
  );
};
          
