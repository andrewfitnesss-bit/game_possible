import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, USERNAME_RE, usernameToEmail } from './lib/supabase';
import type { Profile } from './lib/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<string | null>;
  signUp: (username: string, password: string, fullName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function checkCredentials(username: string, password: string): string | null {
  if (!USERNAME_RE.test(username.trim().toLowerCase())) {
    return 'Логин: 3–32 символа, латиница, цифры и _ . -';
  }
  if (password.length < 6) return 'Пароль должен быть не короче 6 символов';
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | null) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
      console.error('Не удалось загрузить профиль', error);
      setProfile(null);
      return;
    }
    setProfile(data as Profile | null);
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id ?? null);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Вызов Supabase внутри колбэка нельзя await-ить напрямую: уходим в следующий тик.
      setTimeout(() => void loadProfile(next?.user.id ?? null), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Живое обновление своего профиля (назначение в команду, смена роли).
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const channel = supabase
      .channel(`profile-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => setProfile(payload.new as Profile),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id]);

  const signIn = useCallback(async (username: string, password: string) => {
    const problem = checkCredentials(username, password);
    if (problem) return problem;
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
    return error ? 'Неверный логин или пароль' : null;
  }, []);

  const signUp = useCallback(async (username: string, password: string, fullName: string) => {
    const problem = checkCredentials(username, password);
    if (problem) return problem;
    const name = fullName.trim();
    if (name.length < 2 || name.length > 100) return 'Укажите имя (2–100 символов)';
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: { data: { full_name: name } },
    });
    if (error) {
      return /already|registered/i.test(error.message) ? 'Такой логин уже занят' : error.message;
    }
    if (!data.session) {
      return 'Аккаунт создан, но вход не выполнен: в Supabase включено подтверждение email';
    }
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(() => loadProfile(session?.user.id ?? null), [loadProfile, session?.user.id]);

  const value = useMemo<AuthState>(
    () => ({ session, profile, loading, signIn, signUp, signOut, refreshProfile }),
    [session, profile, loading, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
