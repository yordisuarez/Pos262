import React, { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Store,
  WifiOff,
  X,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { mapAuthErrorMessage, supabase } from '../lib/supabase';

interface CloudAuthScreenProps {
  mode?: 'fullscreen' | 'modal';
  isOnline: boolean;
  defaultBusinessName?: string;
  onAuthSuccess: (user: User, businessName?: string) => void;
  onContinueOffline: () => void;
  onClose?: () => void;
}

export const CloudAuthScreen: React.FC<CloudAuthScreenProps> = ({
  mode = 'fullscreen',
  isOnline,
  defaultBusinessName = 'Comercial 262 Suárez',
  onAuthSuccess,
  onContinueOffline,
  onClose,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>(defaultBusinessName);
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
      setErrorMessage('Sin conexión a internet. Puedes continuar en modo offline y conectar luego.');
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
          onAuthSuccess(data.user);
        }
      } else {
        const trimmedBusiness = businessName.trim() || defaultBusinessName;
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              business_name: trimmedBusiness,
            },
          },
        });
        if (error) {
          setErrorMessage(mapAuthErrorMessage(error));
          return;
        }
        if (data.session && data.user) {
          onAuthSuccess(data.user, trimmedBusiness);
        } else {
          setInfoMessage(
            'Cuenta creada. Revisa tu correo para confirmar el registro y luego inicia sesión.'
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

      {!isOnline && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Modo sin conexión detectado. Puedes operar offline y sincronizar al reconectar.</span>
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

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {authTab === 'register' && (
          <div>
            <label htmlFor="cloud-business-name" className="block text-xs font-semibold text-slate-700">
              Nombre del comercio
            </label>
            <div className="relative mt-1">
              <Store className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                id="cloud-business-name"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Comercial 262 Suárez"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="cloud-email" className="block text-xs font-semibold text-slate-700">
            Correo electrónico
          </label>
          <div className="relative mt-1">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              id="cloud-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMessage('');
              }}
              placeholder="comercio@ejemplo.com"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cloud-password" className="block text-xs font-semibold text-slate-700">
            Contraseña
          </label>
          <div className="relative mt-1">
            <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              id="cloud-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={authTab === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMessage('');
              }}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {errorMessage && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {errorMessage}
          </p>
        )}

        {infoMessage && (
          <p className="flex items-start gap-1.5 rounded-lg border border-[#84CC16]/40 bg-[#F7FEE7] px-3 py-2 text-xs font-medium text-[#3F6212]">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#76B900]" />
            <span>{infoMessage}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !isOnline}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <Cloud className="h-3.5 w-3.5" />
          {submitting
            ? 'Conectando...'
            : authTab === 'login'
            ? 'Iniciar sesión y sincronizar'
            : 'Registrar comercio en la nube'}
        </button>
      </form>

      <div className="mt-4 border-t border-slate-100 pt-3 text-center">
        <button
          type="button"
          onClick={onContinueOffline}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2 cursor-pointer"
        >
          {mode === 'fullscreen'
            ? 'Continuar en modo offline (vincular luego en Configuración)'
            : 'Seguir trabajando solo en este dispositivo'}
        </button>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Una vez iniciada la sesión, queda guardada en este dispositivo y el cajero solo usa su PIN diario.
        </p>
      </div>
    </div>
  );

  if (mode === 'modal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
        {card}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] p-4">
      {card}
    </div>
  );
};
