import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircleCheck, Lightbulb, RefreshCw, Trophy, TriangleAlert } from 'lucide-react';
import { useT, type TKey } from '../../i18n/prefs';
import { settingsOf, spendOf, stageProgress, type StageProgress } from '../../lib/game';
import { errText } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import { verticalStyle } from '../../lib/verticals';
import type { Client, Game, HqRequest, MeetingResult, Placement, Profile, Purchase, Team, TeamKam } from '../../lib/types';
import { Empty, money } from '../../ui/kit';

interface AllData {
  clients: Client[];
  members: Profile[];
  placements: Placement[];
  kams: TeamKam[];
  purchases: Purchase[];
  meetings: MeetingResult[];
  requests: HqRequest[];
}

const LIVE_TABLES = ['placements', 'team_kams', 'purchases', 'meeting_results', 'hq_requests', 'profiles'] as const;

// Сводка по всем столам: прогресс текущего этапа (кто отстаёт), состояние и запросы к HQ.
export function Overview({ game, teams }: { game: Game; teams: Team[] }) {
  const t = useT();
  const [data, setData] = useState<AllData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const ids = teams.map((x) => x.id);
    if (ids.length === 0) {
      setData({ clients: [], members: [], placements: [], kams: [], purchases: [], meetings: [], requests: [] });
      return;
    }
    const [c, pr, p, k, pu, m, r] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('profiles').select('*').in('team_id', ids),
      supabase.from('placements').select('*').in('team_id', ids),
      supabase.from('team_kams').select('*').in('team_id', ids),
      supabase.from('purchases').select('*').in('team_id', ids),
      supabase.from('meeting_results').select('*').in('team_id', ids),
      supabase.from('hq_requests').select('*').in('team_id', ids).order('title'),
    ]);
    const failed = [c, pr, p, k, pu, m, r].find((x) => x.error);
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
      purchases: (pu.data ?? []) as Purchase[],
      meetings: (m.data ?? []) as MeetingResult[],
      requests: (r.data ?? []) as HqRequest[],
    });
  }, [teams, t]);

  // Живое обновление: ведущая видит прогресс столов без перезагрузки.
  useEffect(() => {
    void load();
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), 400);
    };
    let channel = supabase.channel('admin-overview');
    for (const table of LIVE_TABLES) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const settings = useMemo(() => settingsOf(game), [game]);
  const teamName = (id: string) => teams.find((x) => x.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    if (!data) return [];
    const list = teams.map((team) => {
      const of = <T extends { team_id: string | null }>(arr: T[]) => arr.filter((x) => x.team_id === team.id);
      const state = {
        clients: data.clients,
        catalog: [],
        placements: of(data.placements),
        kams: of(data.kams),
        purchases: of(data.purchases),
        meetings: of(data.meetings),
        members: of(data.members),
        settings,
      };
      return { team, state, progress: stageProgress(game.phase, state) as StageProgress };
    });
    return list.sort((a, b) => a.progress.percent - b.progress.percent);
  }, [data, teams, game.phase, settings]);

  const avg = rows.length ? rows.reduce((s, r) => s + r.progress.percent, 0) / rows.length : 0;

  return (
    <>
      {error && (
        <div className="callout callout-danger" role="alert">
          {error}
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Activity size={20} />
            <div>
              <h2>{t('ov.progressTitle')}</h2>
              <div className="card-sub">{t('ov.progressSub', { phase: t(`phaseShort.${game.phase}` as TKey) })}</div>
            </div>
          </div>
          <span className="badge badge-success live-dot">{t('ov.live')}</span>
        </div>
        {rows.length === 0 ? (
          <Empty title={t('admin.noTables')}>{t('admin.noTablesText')}</Empty>
        ) : (
          <div className="progress-list">
            {rows.map(({ team, progress }) => {
              const lagging = rows.length > 1 && progress.percent < 100 && progress.percent < avg - 15;
              const done = progress.percent >= 100;
              return (
                <article key={team.id} className={`progress-row${lagging ? ' lagging' : ''}${done ? ' done' : ''}`}>
                  <div className="progress-name">
                    <strong>{team.name}</strong>
                    {lagging && (
                      <span className="badge badge-danger">
                        <TriangleAlert /> {t('ov.lagging')}
                      </span>
                    )}
                    {done && (
                      <span className="badge badge-success">
                        <CircleCheck /> {t('ov.done')}
                      </span>
                    )}
                  </div>
                  <div className="progress-bar">
                    <div className={`bar big${done ? ' ok' : lagging ? ' over' : ''}`}>
                      <span style={{ width: `${progress.percent}%` }} />
                    </div>
                    <span className="progress-pct num">{progress.percent}%</span>
                  </div>
                  <div className="progress-steps">
                    {progress.steps.map((s) => (
                      <span key={s.label} className={s.value >= 1 ? 'step-chip ok' : 'step-chip'}>
                        {s.value >= 1 ? <CircleCheck size={12} /> : null}
                        {t(s.label, s.vars)}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Trophy size={20} />
            <div>
              <h2>{t('ov.resultsTitle')}</h2>
              <div className="card-sub">{t('ov.resultsSub')}</div>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            <RefreshCw size={14} /> {t('common.refresh')}
          </button>
        </div>
        {data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('ov.colTable')}</th>
                  <th>{t('ov.colActive')}</th>
                  <th>{t('ov.colMaint')}</th>
                  <th>{t('ov.colMm')}</th>
                  <th>{t('ov.colSpecs')}</th>
                  <th>{t('ov.colCoins')}</th>
                  <th>{t('ov.colMeetings')}</th>
                  <th>{t('ov.colRevenue')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ team, state }) => (
                  <tr key={team.id}>
                    <td className="strong">{team.name}</td>
                    <td>{state.placements.filter((x) => x.bucket === 'active').length}</td>
                    <td>{state.placements.filter((x) => x.bucket === 'maintenance').length}</td>
                    <td>{state.placements.filter((x) => x.bucket === 'midmarket').length}</td>
                    <td>{state.kams.filter((x) => x.specialization).length}</td>
                    <td>
                      {spendOf(state.purchases, state.kams, settings).total} / {settings.budget}
                    </td>
                    <td>{money(state.meetings.reduce((s, x) => s + x.amount, 0))}</td>
                    <td>
                      <span className="badge">{t('ov.soon')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-title">
          <Lightbulb size={20} />
          <div>
            <h2>{t('ov.hqTitle')}</h2>
            <div className="card-sub">{t('ov.hqSub')}</div>
          </div>
        </div>
        {data && data.requests.length === 0 && <Empty title={t('ov.noRequests')} />}
        {data && data.requests.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('ov.colRequest')}</th>
                  <th>{t('ov.colTable')}</th>
                  <th>{t('ov.colClients')}</th>
                  <th>{t('ov.colPriority')}</th>
                  <th>{t('ov.colPrice')}</th>
                  <th>{t('ov.colBought')}</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.title}
                      {r.barrier && <div className="muted small">{r.barrier}</div>}
                    </td>
                    <td>{teamName(r.team_id)}</td>
                    <td>
                      <div className="targets-line">
                        {r.targets.map((code) => (
                          <span key={code} className="code-badge" style={verticalStyle(code)}>
                            {code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{t(`hq.priority${r.priority}` as TKey)}</td>
                    <td>{r.price === null ? '—' : <span className="coin">{r.price}</span>}</td>
                    <td>
                      {data.purchases.some((p) => p.request_id === r.id && p.status === 'approved') ? (
                        <span className="badge badge-success">{t('common.yes')}</span>
                      ) : (
                        <span className="badge">{t('common.no')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
