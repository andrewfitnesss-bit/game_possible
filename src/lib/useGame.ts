import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Game } from './types';

// Игра пользователя (или текущая активная, если игрок не привязан) с живыми обновлениями раунда и таймера.
export function useGame(gameId: string | null) {
  const [game, setGame] = useState<Game | null>(null);

  const load = useCallback(async () => {
    const query = gameId
      ? supabase.from('games').select('*').eq('id', gameId).maybeSingle()
      : supabase.from('games').select('*').eq('is_active', true).maybeSingle();
    const { data, error } = await query;
    if (!error) setGame((data as Game | null) ?? null);
  }, [gameId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`game-status-${gameId ?? 'active'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, load]);

  return game;
}

export function useCountdown(endsAt: string | null): number | null {
  const target = endsAt ? Date.parse(endsAt) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return target ? target - now : null;
}

export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
