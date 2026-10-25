import { useCallback, useEffect, useRef, useState } from 'react';
import { errText } from './errors';
import { supabase } from './supabase';
import type {
  CatalogItem,
  CatalogSecret,
  Client,
  ClientHint,
  Game,
  HqRequest,
  MeetingResult,
  Placement,
  Profile,
  Purchase,
  Team,
  TeamKam,
} from './types';

export interface TeamData {
  team: Team;
  game: Game;
  members: Profile[];
  clients: Client[];
  catalog: CatalogItem[];
  secrets: CatalogSecret[];
  hints: ClientHint[];
  placements: Placement[];
  kams: TeamKam[];
  purchases: Purchase[];
  hqRequests: HqRequest[];
  meetings: MeetingResult[];
}

const TEAM_TABLES = ['placements', 'team_kams', 'purchases', 'hq_requests', 'meeting_results', 'profiles'] as const;

// Полное состояние стола. Данных немного, поэтому при любом изменении перечитываем всё целиком.
export function useTeamData(teamId: string | null) {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestNo = useRef(0);

  const load = useCallback(async () => {
    if (!teamId) return;
    const no = ++requestNo.current;
    try {
      const t = await supabase.from('teams').select('*').eq('id', teamId).maybeSingle();
      if (t.error) throw t.error;
      if (!t.data) throw new Error('Команда не найдена');
      const team = t.data as Team;
      const [g, members, clients, catalog, secrets, hints, placements, kams, purchases, hq, meetings] =
        await Promise.all([
          supabase.from('games').select('*').eq('id', team.game_id).single(),
          supabase.from('profiles').select('*').eq('team_id', teamId).order('full_name'),
          supabase.from('clients').select('*').order('sort'),
          supabase.from('catalog_items').select('*').order('sort'),
          supabase.from('catalog_secrets').select('*'),
          supabase.from('client_hints').select('*'),
          supabase.from('placements').select('*').eq('team_id', teamId),
          supabase.from('team_kams').select('*').eq('team_id', teamId),
          supabase.from('purchases').select('*').eq('team_id', teamId).order('id', { ascending: false }),
          supabase.from('hq_requests').select('*').eq('team_id', teamId).order('id'),
          supabase.from('meeting_results').select('*').eq('team_id', teamId),
        ]);
      const failed = [g, members, clients, catalog, secrets, hints, placements, kams, purchases, hq, meetings].find(
        (r) => r.error,
      );
      if (failed?.error) throw failed.error;
      if (no !== requestNo.current) return;
      setError(null);
      setData({
        team,
        game: g.data as Game,
        members: (members.data ?? []) as Profile[],
        clients: (clients.data ?? []) as Client[],
        catalog: (catalog.data ?? []) as CatalogItem[],
        secrets: (secrets.data ?? []) as CatalogSecret[],
        hints: (hints.data ?? []) as ClientHint[],
        placements: (placements.data ?? []) as Placement[],
        kams: (kams.data ?? []) as TeamKam[],
        purchases: (purchases.data ?? []) as Purchase[],
        hqRequests: (hq.data ?? []) as HqRequest[],
        meetings: (meetings.data ?? []) as MeetingResult[],
      });
    } catch (e) {
      if (no === requestNo.current) setError(errText(e));
    }
  }, [teamId]);

  const scheduleLoad = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 150);
  }, [load]);

  useEffect(() => {
    if (!teamId) {
      setData(null);
      return;
    }
    void load();
    let channel = supabase.channel(`table-${teamId}`);
    for (const table of TEAM_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `team_id=eq.${teamId}` },
        scheduleLoad,
      );
    }
    channel = channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games' }, scheduleLoad);
    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [teamId, load, scheduleLoad]);

  return { data, error, reload: load };
}
