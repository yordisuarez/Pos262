import { db } from '../db/posDb';
import { supabase } from '../lib/supabase';
import type { SubscriptionRecord, SubscriptionState } from '../types/pos';

export const RENEWAL_WHATSAPP_NUMBER = '584264225879';
const SUBSCRIPTION_CACHE_PREFIX = 'subscription_cache_';
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const RENEWAL_WARNING_DAYS = 2;

interface SupabaseSubscriptionRow {
  user_id: string;
  plan: string | null;
  status: string | null;
  expires_at: string | null;
}

export function buildSubscriptionRenewalWhatsAppUrl(userEmail?: string | null): string {
  const email = (userEmail ?? '').trim();
  const message = `Hola, quiero renovar mi mensualidad de Pos 262. Mi correo es: ${email}`;
  return `https://wa.me/${RENEWAL_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function isTrialPlan(plan?: string | null): boolean {
  const normalized = (plan ?? '').trim().toLowerCase();
  return (
    normalized === '' ||
    normalized.includes('trial') ||
    normalized.includes('prueba') ||
    normalized.includes('demo') ||
    normalized.includes('7d')
  );
}

export function formatPlanLabel(plan?: string | null): string {
  const normalized = (plan ?? '').trim().toLowerCase();
  if (!normalized || normalized.includes('trial') || normalized.includes('prueba')) {
    return 'Prueba de 7 días';
  }
  if (normalized.includes('month') || normalized.includes('mensual')) {
    return 'Plan Mensual';
  }
  if (normalized.includes('year') || normalized.includes('anual')) {
    return 'Plan Anual';
  }
  if (normalized.includes('pro') || normalized.includes('business')) {
    return 'Plan Pro';
  }
  return plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Suscripción Pos 262';
}

export function createInitialSubscriptionState(
  accessStatus: SubscriptionState['accessStatus'] = 'idle'
): SubscriptionState {
  return {
    accessStatus,
    record: null,
    daysRemaining: null,
    hoursRemaining: null,
    showRenewalBanner: false,
    planLabel: 'Suscripción Pos 262',
    isTrial: false,
    fromCache: false,
    checkedAt: null,
  };
}

export function evaluateSubscriptionRecord(
  record: SubscriptionRecord | null,
  options?: { fromCache?: boolean; checkedAt?: string | null; errorMessage?: string }
): SubscriptionState {
  const checkedAt = options?.checkedAt ?? new Date().toISOString();
  const fromCache = Boolean(options?.fromCache);

  if (!record) {
    return {
      accessStatus: 'expired',
      record: null,
      daysRemaining: 0,
      hoursRemaining: 0,
      showRenewalBanner: false,
      planLabel: 'Prueba de 7 días / Mensualidad',
      isTrial: true,
      fromCache,
      checkedAt,
      errorMessage: options?.errorMessage,
    };
  }

  const expiresDate = new Date(record.expiresAt);
  const now = new Date();
  const expiresMs = expiresDate.getTime();
  const isValidDate = Number.isFinite(expiresMs);
  const msRemaining = isValidDate ? expiresMs - now.getTime() : -1;

  // Active strictly when status === 'active' AND new Date(expires_at) > new Date()
  const isActive = record.status === 'active' && isValidDate && expiresDate > now;

  const daysRemaining = isActive ? Math.max(1, Math.ceil(msRemaining / MS_PER_DAY)) : 0;
  const hoursRemaining = isActive ? Math.max(1, Math.ceil(msRemaining / MS_PER_HOUR)) : 0;
  const showRenewalBanner = isActive && daysRemaining <= RENEWAL_WARNING_DAYS;

  return {
    accessStatus: isActive ? 'active' : 'expired',
    record,
    daysRemaining,
    hoursRemaining,
    showRenewalBanner,
    planLabel: formatPlanLabel(record.plan),
    isTrial: isTrialPlan(record.plan),
    fromCache,
    checkedAt,
    errorMessage: options?.errorMessage,
  };
}

async function readCachedSubscription(userId: string): Promise<SubscriptionRecord | null> {
  try {
    const row = await db.settings.get(`${SUBSCRIPTION_CACHE_PREFIX}${userId}`);
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as Partial<SubscriptionRecord>;
    if (
      typeof parsed.userId === 'string' &&
      parsed.userId === userId &&
      typeof parsed.status === 'string' &&
      typeof parsed.expiresAt === 'string'
    ) {
      return {
        userId: parsed.userId,
        plan: typeof parsed.plan === 'string' ? parsed.plan : 'trial',
        status: parsed.status,
        expiresAt: parsed.expiresAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCachedSubscription(userId: string, record: SubscriptionRecord | null): Promise<void> {
  try {
    const key = `${SUBSCRIPTION_CACHE_PREFIX}${userId}`;
    if (!record) {
      await db.settings.delete(key);
      return;
    }
    await db.settings.put({
      key,
      value: JSON.stringify(record),
    });
  } catch {
    // Ignore IndexedDB quota errors
  }
}

/**
 * Fetches the authenticated user's row from `public.subscriptions` filtered by `user_id`.
 * Falls back to the locally cached subscription record only when offline or on transient network failure,
 * still strictly enforcing `status === 'active' && new Date(expires_at) > new Date()`.
 */
export async function fetchAndEvaluateSubscription(
  userId: string,
  timeoutMs = 5000
): Promise<SubscriptionState> {
  const cached = await readCachedSubscription(userId);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (cached) {
      return evaluateSubscriptionRecord(cached, { fromCache: true });
    }
    return {
      accessStatus: 'active',
      record: null,
      daysRemaining: null,
      hoursRemaining: null,
      showRenewalBanner: false,
      planLabel: 'Verificación pendiente (Offline)',
      isTrial: false,
      fromCache: true,
      checkedAt: null,
    };
  }

  try {
    const queryPromise = supabase
      .from('subscriptions')
      .select('user_id, plan, status, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    const timeoutPromise = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    });

    const response = await Promise.race([queryPromise, timeoutPromise]);

    if (!response) {
      if (cached) {
        return evaluateSubscriptionRecord(cached, {
          fromCache: true,
          errorMessage: 'Tiempo de espera agotado al verificar suscripción. Usando último estado.',
        });
      }
      return evaluateSubscriptionRecord(null, {
        fromCache: false,
        errorMessage: 'No se pudo verificar la suscripción en este momento.',
      });
    }

    if (response.error) {
      const msg = response.error.message || 'Error al consultar suscripción.';
      const isNetworkIssue =
        msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network');
      if (isNetworkIssue && cached) {
        return evaluateSubscriptionRecord(cached, { fromCache: true, errorMessage: msg });
      }
      return evaluateSubscriptionRecord(null, { fromCache: false, errorMessage: msg });
    }

    const row = response.data as SupabaseSubscriptionRow | null;
    if (!row || !row.expires_at) {
      await writeCachedSubscription(userId, null);
      return evaluateSubscriptionRecord(null, { fromCache: false });
    }

    const record: SubscriptionRecord = {
      userId: row.user_id,
      plan: row.plan ?? 'trial',
      status: row.status ?? 'inactive',
      expiresAt: row.expires_at,
    };

    await writeCachedSubscription(userId, record);
    return evaluateSubscriptionRecord(record, { fromCache: false });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Error de red al verificar la suscripción.';
    if (cached) {
      return evaluateSubscriptionRecord(cached, { fromCache: true, errorMessage: msg });
    }
    return evaluateSubscriptionRecord(null, { fromCache: false, errorMessage: msg });
  }
}

export function subscribeToSubscriptionChanges(
  userId: string,
  onChange: () => void
): () => void {
  try {
    const channel = supabase
      .channel(`pos_262_subscription_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          onChange();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}
