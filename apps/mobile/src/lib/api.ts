import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The API client.
 *
 * **This differs from the web app on purpose, and it is worth knowing why.**
 * There, the browser never touches the API: every call is a server action
 * and the session lives in an httpOnly cookie the page's JS cannot read.
 * A native app has no server half, so it must hold the token itself.
 *
 * So it goes in the platform keystore — Keychain on iOS, EncryptedSharedPreferences
 * on Android — via expo-secure-store, never AsyncStorage. On web (the target
 * used for visual checks here) SecureStore is unavailable and it falls back
 * to memory only: nothing is persisted to localStorage, because a token that
 * can move money does not belong somewhere any script on the page can read.
 */

const TOKEN_KEY = 'sankalp.session';

export const API_BASE: string =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

let memoryToken: string | null = null;

const secureAvailable = Platform.OS !== 'web';

export async function setToken(token: string | null): Promise<void> {
  memoryToken = token;
  if (!secureAvailable) return;
  if (token === null) await SecureStore.deleteItemAsync(TOKEN_KEY);
  else await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (memoryToken !== null) return memoryToken;
  if (!secureAvailable) return null;
  memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return memoryToken;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Required by every mutating money endpoint (CLAUDE.md #10). */
  idempotencyKey?: string;
  /** Skip the bearer token — the catalogue is readable before signing in. */
  anonymous?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (!options.anonymous) {
    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const envelope = parsed as
      | { error?: { code?: string; message?: string; detail?: Record<string, unknown> } }
      | undefined;
    throw new ApiError(
      envelope?.error?.code ?? 'UNKNOWN',
      // `message` is displayed and never parsed; `code` is what we switch on.
      envelope?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      envelope?.error?.detail,
    );
  }
  return parsed as T;
}

/** Money is bigint paise. Never do arithmetic on it beyond this function. */
export function rupees(paise: string | number | null | undefined): string {
  if (paise === null || paise === undefined || paise === '') return '—';
  try {
    const value = Number(BigInt(paise)) / 100;
    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  } catch {
    return '—';
  }
}

export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ', ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function durationLabel(startIso: string, endIso: string): string {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
