import React, { useState } from 'react';
import {
  Cloud,
  Lock,
  LogOut,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { SubscriptionState } from '../types/pos';
import { buildSubscriptionRenewalWhatsAppUrl } from '../services/subscription';

interface SubscriptionLockScreenProps {
  userEmail: string;
  businessName: string;
  subscription: SubscriptionState;
  isOnline: boolean;
  onRecheck: () => Promise<boolean>;
  onSignOut: () => Promise<void>;
}

export const SubscriptionLockScreen: React.FC<SubscriptionLockScreenProps> = ({
  userEmail,
  businessName,
  subscription,
  isOnline,
  onRecheck,
  onSignOut,
}) => {
  const [checking, setChecking] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [checkFeedback, setCheckFeedback] = useState<string>('');

  const renewalUrl = buildSubscriptionRenewalWhatsAppUrl(userEmail);

  const formattedExpiry = subscription.record?.expiresAt
    ? new Date(subscription.record.expiresAt).toLocaleDateString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const handleRecheck = async () => {
    setCheckFeedback('');
    if (!isOnline) {
      setCheckFeedback('Sin conexión a internet. Conéctate para verificar tu renovación.');
      return;
    }
    setChecking(true);
    try {
      const unlocked = await onRecheck();
      if (!unlocked) {
        setCheckFeedback(
          'Tu suscripción aún figura vencida. Si ya realizaste el pago, espera unos minutos o escríbenos por WhatsApp.'
        );
      }
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#090D12] px-4 py-8 text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0F151D] p-6 sm:p-8 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/90 pb-5">
          <div>
            <p className="text-lg font-extrabold tracking-tight text-white">
              Pos <span className="text-[#84CC16]">262</span>
            </p>
            {businessName && (
              <p className="mt-0.5 text-xs font-medium text-slate-400 truncate max-w-[230px]">
                {businessName}
              </p>
            )}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#84CC16]/30 bg-[#84CC16]/10 text-[#84CC16]">
            <Lock className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#84CC16]">
            Suscripción vencida
          </p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-white">
            Tu periodo de prueba de 7 días o mensualidad ha vencido
          </h1>
          <p className="text-sm font-medium leading-relaxed text-slate-300">
            Renueva tu suscripción para continuar facturando, controlando inventario y sincronizando
            tus cajas en <span className="font-bold text-white">Pos 262</span>.
          </p>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#84CC16]/25 bg-[#84CC16]/[0.07] p-4">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#84CC16]/15 text-[#84CC16]">
            <Cloud className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">
              Tus datos en la nube siguen guardados
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Tus productos, ventas, clientes, turnos y configuración permanecen respaldados de forma
              segura en la nube. Al renovar, recuperas el acceso inmediato.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-[#0B1016] p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-400">Cuenta</span>
            <span className="truncate font-bold text-white">{userEmail}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-400">Plan</span>
            <span className="font-semibold text-slate-200">{subscription.planLabel}</span>
          </div>
          {formattedExpiry && (
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-400">Vencimiento</span>
              <span className="font-mono font-bold tabular-nums text-amber-400">
                {formattedExpiry}
              </span>
            </div>
          )}
        </div>

        {checkFeedback && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200">
            {checkFeedback}
          </div>
        )}

        <div className="mt-6 space-y-2.5">
          <a
            href={renewalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#84CC16] px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-[#9AE62E] transition-colors"
          >
            <MessageCircle className="h-4 w-4 stroke-[2.4]" />
            Renovar por WhatsApp
          </a>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleRecheck()}
              disabled={checking}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin text-[#84CC16]' : ''}`} />
              {checking ? 'Verificando...' : 'Ya renové'}
            </button>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-transparent px-3 py-2 text-xs font-bold text-slate-400 hover:border-slate-700 hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              {signingOut ? 'Saliendo...' : 'Cambiar cuenta'}
            </button>
          </div>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-[#84CC16]" />
          Respaldo activo en Supabase · Activación rápida por WhatsApp
        </p>
      </div>
    </div>
  );
};
