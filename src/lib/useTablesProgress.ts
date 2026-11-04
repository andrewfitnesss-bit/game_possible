import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n/prefs';
import { errText } from './errors';
import { settingsOf, stageProgress, type StageProgress, type TeamState } from './game';
import { supabase } from './supabase';
import type { Client, Game, HqRequest, MeetingResult, Placement, Profile, Purchase, SpecTraining, Team, TeamKam } from './types';

export interface AllTablesData {
  clients: Client[];
  members: Profile[];
  placements: Placement[];
  kams: TeamKam[];
  trainings: SpecTraining[];
  purchases: Purchase[];
  meetings: MeetingResult[];
  requests: HqRequest[];
}

export interface TableRow {
  team: Team;
  state: TeamState;
  progress: StageProgress;
}

const EMPTY: AllTablesData = { clients: [], members: [], placements: [], kams: [], trainings: [], purchases: [], meetings: [], requests: [] };
const LIVE_TABLES = ['placements', 'team_kams', 'spec_trainings', 'purchases', 'meeting_results', 'hq_requests', 'profiles'] as const;

// Состояние и прогресс текущего этапа всех столов игры с живым обновлением.
// Используется сводкой в админке и экраном для проектора; строки отсортированы от отстающих к лидерам.
export function useTablesProgress(game: Game, teams: Team[], channelName: string) {
  const t = useT();
  const [data, setData] = useState<AllTablesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const ids = teams.map((x) => x.id);
    if (ids.length === 0) {
      setData(EMPTY);
      return;
    }
    const [c, pr, p, k, st, pu, m, r] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('profiles').select('*').in('team_id', ids),
      supabase.from('placements').select('*').in('team_id', ids),
      supabase.from('team_kams').select('*').in('team_id', ids),
      supabase.from('spec_trainings').select('*').in('team_id', ids),
      supabase.from('purchases').select('*').in('team_id', ids),
      supabase.from('meeting_results').select('*').in('team_id', ids),
      supabase.from('hq_requests').select('*').in('team_id', ids).order('title'),
    ]);
    const failed = [c, pr, p, k, st, pu, m, r].find((x) => x.error);
    if (failed?.error) {
      setError(errText(failed.error, t));
      return;
    }
    setError(null);
    setData({
      clients: (c.data ?? []) as Client[],
      members: (pr.data ?? []) as Profile[],
      placements: (p.data ?? []) as Placement[],
      kams: (k.data ?? []) as TeamKam[],
      trainings: (st.data ?? []) as SpecTraining[],
      purchases: (pu.data ?? []) as Purchase[],
      meetings: (m.data ?? []) as MeetingResult[],
      requests: (r.data ?? []) as HqRequest[],
    });
  }, [teams, t]);

  useEffect(() => {
    void load();
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), 400);
    };
    let channel = supabase.channel(channelName);
    for (const table of LIVE_TABLES) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [load, channelName]);

  const settings = useMemo(() => settingsOf(game), [game]);

  const rows = useMemo<TableRow[]>(() => {
    if (!data) return [];
    return teams
      .map((team) => {
        const of = <T extends { team_id: string | null }>(arr: T[]) => arr.filter((x) => x.team_id === team.id);
        const state: TeamState = {
          clients: data.clients,
          catalog: [],
          placements: of(data.placements),
          kams: of(data.kams),
          trainings: of(data.trainings),
          purchases: of(data.purchases),
          meetings: of(data.meetings),
          members: of(data.members),
          settings,
        };
        return { team, state, progress: stageProgress(game.phase, state) };
      })
      .sort((a, b) => a.progress.percent - b.progress.percent);
  }, [data, teams, game.phase, settings]);

  const avg = rows.length ? rows.reduce((s, r) => s + r.progress.percent, 0) / rows.length : 0;
  return { data, rows, avg, settings, error, reload: load };
}

/** Стол отстаёт, если он ниже среднего более чем на 15 п.п. и не закончил этап. */
export function isLagging(row: TableRow, avg: number, total: number): boolean {
  return total > 1 && row.progress.percent < 100 && row.progress.percent < avg - 15;
}
