import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, api, getToken, setToken } from './api';
import { CategoryNode, ResolvedDomain } from './pack';

/**
 * Session and pack, held once for the whole app.
 *
 * The domain is fetched at start-up because *everything* visible depends
 * on it: the vocabulary, the theme, the engagement types, the price
 * bands. A screen never fetches its own labels.
 */

export interface Me {
  id: string;
  email: string;
  role: 'seeker' | 'provider' | 'admin';
  adultConfirmedAt: string | null;
}

interface Store {
  me: Me | null;
  domain: ResolvedDomain | null;
  categories: CategoryNode[];
  lang: string;
  ready: boolean;
  setLang: (l: string) => void;
  signIn: (email: string, password: string, totpCode?: string) => Promise<{ mfaEnrolment?: boolean }>;
  register: (email: string, password: string, role: 'seeker' | 'provider') => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

/** The domain the app opens on. A real build would let the user choose. */
const DEFAULT_DOMAIN = 'upsc_cse';

export function StoreProvider({ children }: { children: ReactNode }): JSX.Element {
  const [me, setMe] = useState<Me | null>(null);
  const [domain, setDomain] = useState<ResolvedDomain | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [lang, setLang] = useState('en');
  const [ready, setReady] = useState(false);

  const loadMe = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<Me>('/auth/me'));
    } catch (err) {
      // A 401 means the session is gone — clear it rather than looping.
      if (err instanceof ApiError && err.status === 401) {
        await setToken(null);
        setMe(null);
      }
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const [d, c] = await Promise.all([
        api<ResolvedDomain>(`/domains/${DEFAULT_DOMAIN}`, { anonymous: true }).catch(() => null),
        api<CategoryNode[]>(`/domains/${DEFAULT_DOMAIN}/categories`, { anonymous: true }).catch(() => []),
      ]);
      setDomain(d);
      setCategories(c);
      if (d) setLang(d.defaultLanguage);
      await loadMe();
      setReady(true);
    })();
  }, [loadMe]);

  const signIn = useCallback<Store['signIn']>(
    async (email, password, totpCode) => {
      const result = await api<{
        outcome: 'session' | 'mfa_enrolment_required';
        token?: string;
        enrolmentToken?: string;
      }>('/auth/login', {
        method: 'POST',
        anonymous: true,
        body: { email, password, totpCode: totpCode || undefined },
      });

      if (result.outcome === 'mfa_enrolment_required') {
        // A provider or admin with no confirmed second factor (#32).
        return { mfaEnrolment: true };
      }
      await setToken(result.token ?? null);
      await loadMe();
      return {};
    },
    [loadMe],
  );

  const register = useCallback<Store['register']>(async (email, password, role) => {
    await api('/auth/register', {
      method: 'POST',
      anonymous: true,
      // #27 — the API refuses registration without an explicit attestation.
      body: { email, password, role, confirmsAdult: true },
    });
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await setToken(null);
    setMe(null);
  }, []);

  const value = useMemo<Store>(
    () => ({ me, domain, categories, lang, ready, setLang, signIn, register, signOut, refresh: loadMe }),
    [me, domain, categories, lang, ready, signIn, register, signOut, loadMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

/** Convenience: the family's word for each party, in the current language. */
export function useWords(): { seeker: string; provider: string; engagement: string; family: string } {
  const { domain, lang } = useStore();
  const pick = (m: Record<string, string> | undefined): string =>
    m ? (m[lang] ?? m.en ?? Object.values(m)[0] ?? '') : '';
  return {
    seeker: pick(domain?.labels.seeker) || 'Seeker',
    provider: pick(domain?.labels.provider) || 'Provider',
    engagement: pick(domain?.labels.engagement) || 'Engagement',
    family: pick(domain?.labels.family) || 'Sankalp',
  };
}
