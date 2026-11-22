import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://mmgbcwxowlajrrihgrkw.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_5qER2lYsXtKgIEUCRkxoIg_iDMQiDvW';

export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || DEFAULT_SUPABASE_URL;

export const SUPABASE_ANON_KEY: string =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'pos_262_supabase_auth',
  },
});

/**
 * Safely retrieves the persisted Supabase session without throwing or hanging
 * when the device starts offline or has an unstable connection.
 */
export async function getSafeSession(timeoutMs = 3500): Promise<{
  session: Session | null;
  user: User | null;
  offlineFallback: boolean;
}> {
  try {
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    });

    const result = await Promise.race([sessionPromise, timeoutPromise]);
    if (!result) {
      return { session: null, user: null, offlineFallback: true };
    }

    if (result.error) {
      return { session: null, user: null, offlineFallback: !navigator.onLine };
    }

    const session = result.data.session ?? null;
    return {
      session,
      user: session?.user ?? null,
      offlineFallback: false,
    };
  } catch {
    return { session: null, user: null, offlineFallback: true };
  }
}

export function mapAuthErrorMessage(error: unknown): string {
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  const lower = raw.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Tu correo aún no ha sido confirmado. Revisa tu bandeja de entrada.';
  }
  if (lower.includes('user already registered')) {
    return 'Este correo ya está registrado. Inicia sesión con tu contraseña.';
  }
  if (lower.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Sin conexión a internet. Puedes continuar en modo offline y sincronizar luego.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Demasiados intentos. Espera un momento e intenta nuevamente.';
  }
  return raw || 'No se pudo completar la operación con la nube.';
}
