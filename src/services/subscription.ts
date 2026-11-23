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

const TRIAL_DURATION_DAYS = 7;
const inFlightSubscriptionChecks = new Map<string, Promise<SubscriptionState>>();

function buildTrialFallbackState(
  userId: string,
  expiresAt: string,
  options?: { fromCache?: boolean; errorMessage?: string }
): SubscriptionState {
  const trialRecord: SubscriptionRecord = {
    userId,
    plan: 'trial',
    status: 'active',
    expiresAt,
  };
  return evaluateSubscriptionRecord(trialRecord, {
    fromCache: Boolean(options?.fromCache),
    errorMessage: options?.errorMessage,
  });
}

async function createInitialTrialSubscription(userId: string): Promise<SubscriptionState> {
  const expiresAt = new Date(Date.now() + TRIAL_DURATION_DAYS * MS_PER_DAY).toISOString();

  const { data: insertedRow, error: insertError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan: 'trial',
      status: 'active',
      expires_at: expiresAt,
    })
    .select('user_id, plan, status, expires_at')
    .maybeSingle();

  if (insertError) {
    // Handle concurrent insert race: another tab/request created the row first
    if (insertError.code === '23505') {
      const { data: existingRow } = await supabase
        .from('subscriptions')
        .select('user_id, plan, status, expires_at')
        .eq('user_id', userId)
        .maybeSingle();

      const resolved = existingRow as SupabaseSubscriptionRow | null;
      if (resolved) {
        const existingRecord: SubscriptionRecord = {
          userId: resolved.user_id,
          plan: resolved.plan ?? 'trial',
          status: resolved.status ?? 'inactive',
          expiresAt: resolved.expires_at ?? '',
        };
        await writeCachedSubscription(userId, existingRecord);
        return evaluateSubscriptionRecord(existingRecord, { fromCache: false });
      }
    }

    // Do not lock a new user without an expired record if insert failed transiently
    return buildTrialFallbackState(userId, expiresAt, {
      fromCache: true,
      errorMessage: insertError.message || 'No se pudo registrar la prueba automáticamente.',
    });
  }

  const row = insertedRow as SupabaseSubscriptionRow | null;
  const createdRecord: SubscriptionRecord = {
    userId: row?.user_id ?? userId,
    plan: row?.plan ?? 'trial',
    status: row?.status ?? 'active',
    expiresAt: row?.expires_at ?? expiresAt,
  };

  await writeCachedSubscription(userId, createdRecord);
  return evaluateSubscriptionRecord(createdRecord, { fromCache: false });
}

async function runFetchAndEvaluateSubscription(
  userId: string,
  timeoutMs: number
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
      return {
        accessStatus: 'active',
        record: null,
        daysRemaining: null,
        hoursRemaining: null,
        showRenewalBanner: false,
        planLabel: 'Verificación pendiente',
        isTrial: false,
        fromCache: true,
        checkedAt: null,
        errorMessage: 'Tiempo de espera agotado al consultar la suscripción.',
      };
    }

    if (response.error) {
      const msg = response.error.message || 'Error al consultar suscripción.';
      if (cached) {
        return evaluateSubscriptionRecord(cached, { fromCache: true, errorMessage: msg });
      }
      return {
        accessStatus: 'active',
        record: null,
        daysRemaining: null,
        hoursRemaining: null,
        showRenewalBanner: false,
        planLabel: 'Verificación pendiente',
        isTrial: false,
        fromCache: true,
        checkedAt: null,
        errorMessage: msg,
      };
    }

    const row = response.data as SupabaseSubscriptionRow | null;
    if (!row) {
      return await createInitialTrialSubscription(userId);
    }

    const record: SubscriptionRecord = {
      userId: row.user_id,
      plan: row.plan ?? 'trial',
      status: row.status ?? 'inactive',
      expiresAt: row.expires_at ?? '',
    };

    await writeCachedSubscription(userId, record);
    return evaluateSubscriptionRecord(record, { fromCache: false });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Error de red al verificar la suscripción.';
    if (cached) {
      return evaluateSubscriptionRecord(cached, { fromCache: true, errorMessage: msg });
    }
    return {
      accessStatus: 'active',
      record: null,
      daysRemaining: null,
      hoursRemaining: null,
      showRenewalBanner: false,
      planLabel: 'Verificación pendiente',
      isTrial: false,
      fromCache: true,
      checkedAt: null,
      errorMessage: msg,
    };
  }
}

/**
 * Fetches the authenticated user's row from `public.subscriptions` filtered by `user_id`.
 * If no row exists yet, automatically inserts a 7-day active trial row and grants access.
 * Locks access ONLY when an existing record has `status !== 'active'` or `new Date(expires_at) <= new Date()`.
 */
export async function fetchAndEvaluateSubscription(
  userId: string,
  timeoutMs = 5000
): Promise<SubscriptionState> {
  const existingPromise = inFlightSubscriptionChecks.get(userId);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = runFetchAndEvaluateSubscription(userId, timeoutMs).finally(() => {
    inFlightSubscriptionChecks.delete(userId);
  });

  inFlightSubscriptionChecks.set(userId, promise);
  return promise;
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
