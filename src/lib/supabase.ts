import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error('Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (см. файл .env)');
}

export const supabase = createClient(url, anonKey);

export const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@game.local`;
}
