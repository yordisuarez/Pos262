import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { formatPlanLabel } from './subscription';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
export const EXPIRING_SOON_DAYS = 5;

const DEFAULT_SUPER_ADMIN_EMAILS = ['yordisuarez@gmail.com'];

const ALLOWED_STATUSES = new Set(['active', 'trial', 'suspended', 'expired', 'cancelled']);

function getConfiguredSuperAdminEmails(): string[] {
  const raw = (import.meta.env.VITE_SUPER_ADMIN_EMAILS as string | undefined) || '';
  const parsed = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_SUPER_ADMIN_EMAILS, ...parsed]));
}

export function isSuperAdminEmail(email?: string | null): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return getConfiguredSuperAdminEmails().includes(normalized);
}

export type SubscriptionHealthStatus = 'active' | 'expiring' | 'expired';

export interface AdminSubscriptionItem {
  id?: string;
  userId: string;
  email: string;
  businessName: string;
  phone: string;
  rif: string;
  plan: string;
  planLabel: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  notes: string;
  health: SubscriptionHealthStatus;
  statusLabel: string;
  daysRemaining: number;
  daysOverdue: number;
  daysElapsed: number;
}

interface RawSubscriptionRow {
  id?: string | number | null;
  user_id?: string | null;
  email?: string | null;
  user_email?: string | null;
  client_email?: string | null;
  business_name?: string | null;
  client_name?: string | null;
  phone?: string | null;
  rif?: string | null;
  plan?: string | null;
  status?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
}

interface RawBusinessSettingsRow {
  user_id?: string;
  business_name?: string | null;
  phone?: string | null;
  rif?: string | null;
}

export function normalizeAdminSubscription(
  row: RawSubscriptionRow,
  business?: RawBusinessSettingsRow
): AdminSubscriptionItem | null {
  const id =
    typeof row.id === 'string' && row.id.trim()
      ? row.id.trim()
      : typeof row.id === 'number' && Number.isFinite(row.id)
      ? String(row.id)
      : undefined;
  const userId =
    typeof row.user_id === 'string' && row.user_id.trim()
      ? row.user_id.trim()
      : id ?? '';
  if (!userId) return null;

  const nowMs = Date.now();
  const createdAt =
    typeof row.created_at === 'string' && row.created_at
      ? row.created_at
      : typeof row.updated_at === 'string' && row.updated_at
      ? row.updated_at
      : new Date(nowMs).toISOString();
  const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : '';
  const updatedAt = typeof row.updated_at === 'string' && row.updated_at ? row.updated_at : createdAt;

  const plan = (row.plan ?? 'trial').trim() || 'trial';
  const rawStatus = (row.status ?? 'inactive').trim().toLowerCase();

  const expiresMs = new Date(expiresAt).getTime();
  const createdMs = new Date(createdAt).getTime();
  const hasValidExpiry = Number.isFinite(expiresMs);
  const hasValidCreated = Number.isFinite(createdMs);

  const msRemaining = hasValidExpiry ? expiresMs - nowMs : -1;
  const isStatusEnabled = rawStatus === 'active' || rawStatus === 'trial';
  const isNotExpired = hasValidExpiry && msRemaining > 0;
  const isOperational = isStatusEnabled && isNotExpired;

  const daysRemaining = isOperational ? Math.max(1, Math.ceil(msRemaining / MS_PER_DAY)) : 0;
  const daysOverdue =
    !isNotExpired && hasValidExpiry ? Math.max(0, Math.floor((nowMs - expiresMs) / MS_PER_DAY)) : 0;
  const daysElapsed = hasValidCreated
    ? Math.max(0, Math.floor((nowMs - createdMs) / MS_PER_DAY))
    : 0;

  let health: SubscriptionHealthStatus = 'expired';
  let statusLabel = 'Vencido';

  if (rawStatus === 'suspended' || rawStatus === 'cancelled' || rawStatus === 'inactive') {
    health = 'expired';
    statusLabel = rawStatus === 'cancelled' ? 'Cancelado' : 'Suspendido';
  } else if (isOperational) {
    if (daysRemaining <= EXPIRING_SOON_DAYS) {
      health = 'expiring';
      statusLabel = 'Por vencer';
    } else {
      health = 'active';
      statusLabel = 'Activo';
    }
  } else {
    health = 'expired';
    statusLabel = 'Vencido';
  }

  const businessName = (
    row.business_name ||
    row.client_name ||
    business?.business_name ||
    ''
  ).trim();
  const email = (row.email || row.user_email || row.client_email || '').trim();
  const phone = (row.phone || business?.phone || '').trim();
  const rif = (row.rif || business?.rif || '').trim();
  const notes = (row.notes || '').trim();

  return {
    id,
    userId,
    email,
    businessName,
    phone,
    rif,
    plan,
    planLabel: formatPlanLabel(plan),
    status: rawStatus || 'inactive',
    createdAt,
    expiresAt,
    updatedAt,
    notes,
    health,
    statusLabel,
    daysRemaining,
    daysOverdue,
    daysElapsed,
  };
}

export async function fetchAllClientSubscriptions(): Promise<{
  items: AdminSubscriptionItem[];
  usedFallbackQuery: boolean;
  rpcWarning?: string;
  errorMessage?: string;
}> {
  if (!isSupabaseConfigured) {
    return {
      items: [],
      usedFallbackQuery: false,
      errorMessage: 'Supabase no está configurado en este entorno.',
    };
  }

  // Primary path: get_admin_subscriptions RPC joining public.subscriptions with auth.users
  // Fetch optional business metadata in parallel so cards also display business name / phone / RIF
  const [rpcResult, bizRes] = await Promise.all([
    supabase.rpc('get_admin_subscriptions'),
    supabase.from('business_settings').select('user_id, business_name, phone, rif'),
  ]);

  const businessMap = new Map<string, RawBusinessSettingsRow>();
  if (!bizRes.error && Array.isArray(bizRes.data)) {
    (bizRes.data as RawBusinessSettingsRow[]).forEach((biz) => {
      if (biz.user_id) {
        businessMap.set(biz.user_id, biz);
      }
    });
  }

  const normalizeAndSort = (rows: RawSubscriptionRow[]): AdminSubscriptionItem[] =>
    rows
      .map((row) =>
        normalizeAdminSubscription(row, row.user_id ? businessMap.get(row.user_id) : undefined)
      )
      .filter((item): item is AdminSubscriptionItem => item !== null)
      .sort((a, b) => {
        const aMs = new Date(a.expiresAt).getTime() || 0;
        const bMs = new Date(b.expiresAt).getTime() || 0;
        return aMs - bMs;
      });

  if (!rpcResult.error) {
    const rpcRows = Array.isArray(rpcResult.data)
      ? (rpcResult.data as RawSubscriptionRow[])
      : [];
    return {
      items: normalizeAndSort(rpcRows),
      usedFallbackQuery: false,
    };
  }

  // Secondary RPC compatibility fallback
  const legacyRpcResult = await supabase.rpc('admin_list_subscriptions');
  if (!legacyRpcResult.error && Array.isArray(legacyRpcResult.data)) {
    return {
      items: normalizeAndSort(legacyRpcResult.data as RawSubscriptionRow[]),
      usedFallbackQuery: false,
    };
  }

  // Final fallback: direct public.subscriptions query (without auth.users email)
  const subsRes = await supabase
    .from('subscriptions')
    .select('*')
    .order('expires_at', { ascending: true });

  if (subsRes.error) {
    return {
      items: [],
      usedFallbackQuery: true,
      rpcWarning: rpcResult.error.message,
      errorMessage:
        subsRes.error.message ||
        rpcResult.error.message ||
        'No se pudieron cargar las suscripciones desde Supabase. Verifica el RPC get_admin_subscriptions y las políticas RLS de Super Admin.',
    };
  }

  return {
    items: normalizeAndSort((subsRes.data as RawSubscriptionRow[] | null) ?? []),
    usedFallbackQuery: true,
    rpcWarning: rpcResult.error.message,
  };
}

export async function updateClientSubscription(params: {
  id?: string;
  userId: string;
  plan: string;
  status: string;
  expiresAt: string;
  notes?: string;
}): Promise<{ ok: boolean; errorMessage?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, errorMessage: 'Supabase no está configurado.' };
  }
  const hasValidUserId = UUID_REGEX.test(params.userId);
  const hasValidRowId = Boolean(
    params.id && (UUID_REGEX.test(params.id) || /^\d+$/.test(params.id))
  );
  if (!hasValidUserId && !hasValidRowId) {
    return { ok: false, errorMessage: 'Identificador de suscripción inválido.' };
  }

  const cleanStatus = params.status.trim().toLowerCase();
  if (!ALLOWED_STATUSES.has(cleanStatus)) {
    return { ok: false, errorMessage: 'Estado de suscripción no permitido.' };
  }

  const expiryDate = new Date(params.expiresAt);
  if (!Number.isFinite(expiryDate.getTime())) {
    return { ok: false, errorMessage: 'Fecha de vencimiento inválida.' };
  }

  const cleanPlan = params.plan.trim().slice(0, 60) || 'mensual';
  const cleanNotes = (params.notes ?? '').trim().slice(0, 400);
  const nowIso = new Date().toISOString();

  const fullPayload: Record<string, string> = {
    plan: cleanPlan,
    status: cleanStatus,
    expires_at: expiryDate.toISOString(),
    updated_at: nowIso,
    notes: cleanNotes,
  };

  const runUpdate = async (column: 'user_id' | 'id', matchValue: string) => {
    let { data, error } = await supabase
      .from('subscriptions')
      .update(fullPayload)
      .eq(column, matchValue)
      .select(column)
      .maybeSingle();

    // Graceful fallback if the live Supabase table doesn't have a `notes` column yet
    if (error && (error.code === '42703' || error.message?.toLowerCase().includes('notes'))) {
      const basePayload = {
        plan: cleanPlan,
        status: cleanStatus,
        expires_at: expiryDate.toISOString(),
        updated_at: nowIso,
      };
      const retry = await supabase
        .from('subscriptions')
        .update(basePayload)
        .eq(column, matchValue)
        .select(column)
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    return { data, error };
  };

  let { data, error } = hasValidRowId
    ? await runUpdate('id', params.id as string)
    : await runUpdate('user_id', params.userId);

  if (
    hasValidUserId &&
    ((error && (error.code === '42703' || error.message?.toLowerCase().includes('column'))) ||
      (!error && !data && hasValidRowId && params.id !== params.userId))
  ) {
    const byUserIdResult = await runUpdate('user_id', params.userId);
    data = byUserIdResult.data;
    error = byUserIdResult.error;
  }

  if (error) {
    return {
      ok: false,
      errorMessage:
        error.message || 'No se pudo actualizar la suscripción en Supabase.',
    };
  }

  if (!data) {
    return {
      ok: false,
      errorMessage:
        'Supabase no permitió modificar este registro (verifica las políticas RLS de Super Admin en supabase/schema.sql).',
    };
  }

  return { ok: true };
}

export async function extendClientSubscriptionDays(
  item: AdminSubscriptionItem,
  daysToAdd: number
): Promise<{ ok: boolean; nextExpiresAt?: string; errorMessage?: string }> {
  const safeDays = Math.round(daysToAdd);
  if (!Number.isFinite(safeDays) || safeDays < 1 || safeDays > 3650) {
    return { ok: false, errorMessage: 'Cantidad de días inválida.' };
  }

  const nowMs = Date.now();
  const currentExpiryMs = new Date(item.expiresAt).getTime();
  const baseMs =
    Number.isFinite(currentExpiryMs) && currentExpiryMs > nowMs ? currentExpiryMs : nowMs;
  const nextExpiresAt = new Date(baseMs + safeDays * MS_PER_DAY).toISOString();

  const nextPlan =
    item.plan.trim().toLowerCase() === 'trial' && safeDays >= 30 ? 'mensual' : item.plan;

  const result = await updateClientSubscription({
    id: item.id,
    userId: item.userId,
    plan: nextPlan,
    status: 'active',
    expiresAt: nextExpiresAt,
    notes: item.notes,
  });

  if (!result.ok) {
    return { ok: false, errorMessage: result.errorMessage };
  }

  return { ok: true, nextExpiresAt };
}

export function buildClientSubscriptionWhatsAppUrl(item: AdminSubscriptionItem): string | null {
  const digits = item.phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  const clientLabel = item.businessName || item.email || 'cliente';
  const formattedExpiry = Number.isFinite(new Date(item.expiresAt).getTime())
    ? new Date(item.expiresAt).toLocaleDateString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';

  let message: string;
  if (item.health === 'expired') {
    message = `Hola ${clientLabel}, tu suscripción de Pos 262 (${item.planLabel}) venció${
      formattedExpiry ? ` el ${formattedExpiry}` : ''
    }. Escríbenos si deseas renovarla para reactivar tu acceso.`;
  } else if (item.health === 'expiring') {
    message = `Hola ${clientLabel}, tu suscripción de Pos 262 (${item.planLabel}) vence pronto (${formattedExpiry}, quedan ${item.daysRemaining} día${
      item.daysRemaining === 1 ? '' : 's'
    }). Avísanos para renovarla sin interrupciones.`;
  } else {
    message = `Hola ${clientLabel}, confirmamos que tu suscripción de Pos 262 (${item.planLabel}) está activa hasta el ${formattedExpiry} (${item.daysRemaining} días restantes). ¡Gracias por confiar en Pos 262!`;
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
