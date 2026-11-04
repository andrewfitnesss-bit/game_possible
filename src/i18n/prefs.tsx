import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { en } from './en';
import { ru, type Dict } from './ru';

export type Lang = 'ru' | 'en';
export type Theme = 'arena' | 'corp' | 'wallst';
export type Mode = 'light' | 'dark' | 'system';

export interface Prefs {
  lang: Lang;
  theme: Theme;
  mode: Mode;
}

export type TKey = keyof Dict;
export type TVars = Record<string, string | number>;
export type T = (key: TKey, vars?: TVars) => string;

const DICTS: Record<Lang, Dict> = { ru, en };
const STORAGE_KEY = 'nal-prefs';
const DEFAULT_PREFS: Prefs = { lang: 'ru', theme: 'arena', mode: 'system' };

function sanitize(raw: unknown): Prefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Prefs, unknown>>;
  return {
    lang: p.lang === 'en' ? 'en' : 'ru',
    theme: p.theme === 'corp' || p.theme === 'wallst' ? p.theme : 'arena',
    mode: p.mode === 'light' || p.mode === 'dark' ? p.mode : 'system',
  };
}

function readStored(): Prefs {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_PREFS;
  }
}

function store(p: Prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Хранилище недоступно (приватный режим) — настройки живут до перезагрузки.
  }
}

export function translate(lang: Lang, key: TKey, vars?: TVars): string {
  const template = DICTS[lang][key] ?? ru[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

interface PrefsState extends Prefs {
  t: T;
  setPrefs: (patch: Partial<Prefs>) => void;
  /** Фактический режим с учётом «как в системе». */
  dark: boolean;
}

const PrefsContext = createContext<PrefsState | null>(null);

function useSystemDark(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

// Язык, тема и режим игрока. Хранятся в профиле (едут с игроком на любое устройство) и дублируются в браузере.
export function PrefsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [prefs, setPrefsState] = useState<Prefs>(readStored);
  const systemDark = useSystemDark();

  const profilePrefs = profile?.prefs;
  useEffect(() => {
    if (profilePrefs && Object.keys(profilePrefs).length > 0) {
      const next = sanitize(profilePrefs);
      setPrefsState(next);
      store(next);
    }
  }, [profilePrefs]);

  const signedIn = Boolean(profile);
  const setPrefs = useCallback(
    (patch: Partial<Prefs>) => {
      const next = { ...prefs, ...patch };
      setPrefsState(next);
      store(next);
      if (signedIn) void supabase.rpc('set_my_prefs', { p_prefs: next });
    },
    [prefs, signedIn],
  );

  const dark = prefs.mode === 'dark' || (prefs.mode === 'system' && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.mode = dark ? 'dark' : 'light';
    root.lang = prefs.lang;
    const color = prefs.theme === 'corp' ? (dark ? '#14181b' : '#ffffff') : prefs.theme === 'wallst' ? '#0b2a1f' : '#16120e';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [prefs.theme, prefs.lang, dark]);

  const t = useCallback<T>((key, vars) => translate(prefs.lang, key, vars), [prefs.lang]);

  const value = useMemo<PrefsState>(() => ({ ...prefs, t, setPrefs, dark }), [prefs, t, setPrefs, dark]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsState {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs вне PrefsProvider');
  return ctx;
}

export function useT(): T {
  return usePrefs().t;
}
