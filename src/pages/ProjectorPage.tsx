import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, Maximize, Minimize, Target, TriangleAlert, X } from 'lucide-react';
import { Brand } from '../components/layout/AppShell';
import { useT, type TKey } from '../i18n/prefs';
import { PHASES, PLAYABLE_PHASES } from '../lib/game';
import { supabase } from '../lib/supabase';
import { formatLeft, useCountdown, useGame } from '../lib/useGame';
import { isLagging, useTablesProgress } from '../lib/useTablesProgress';
import type { Game, Team } from '../lib/types';
import { Loading } from '../ui/kit';

/** Адрес экрана для проектора: та же страница с хешем. */
export const PROJECTOR_HASH = '#projector';

export function openProjector() {
  window.open(`${window.location.pathname}${PROJECTOR_HASH}`, 'nal-projector');
}

// Экран для большого экрана в зале: раунд, крупный таймер, задача раунда и прогресс всех столов.
export function ProjectorPage() {
  const t = useT();
  const game = useGame(null);
  if (!game) return <Loading text={t('common.loading')} />;
  return <ProjectorBody game={game} />;
}

function ProjectorBody({ game }: { game: Game }) {
  const t = useT();
  const [teams, setTeams] = useState<Team[]>([]);
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  const left = useCountdown(game.phase_ends_at);
  const { rows, avg } = useTablesProgress(game, teams, 'projector');
  const index = PHASES.findIndex((p) => p.id === game.phase);

  const loadTeams = useCallback(async () => {
    const { data } = await supabase.from('teams').select('*').eq('game_id', game.id).order('created_at').order('id');
    setTeams((data ?? []) as Team[]);
  }, [game.id]);

  useEffect(() => {
    void loadTeams();
    const channel = supabase
      .channel('projector-teams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => void loadTeams())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadTeams]);

  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  // Столы в зале показываем в их обычном порядке, а не по прогрессу.
  const ordered = teams.map((team) => rows.find((r) => r.team.id === team.id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const urgent = left !== null && left > 0 && left <= 60_000;

  return (
    <div className="projector">
      <header className="projector-top">
        <Brand />
        <span className="projector-game">{game.name}</span>
        <div className="row">
          <button type="button" className="btn btn-ghost btn-icon" onClick={toggleFull} aria-label={t('proj.fullscreen')} title={t('proj.fullscreen')}>
            {full ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => (window.location.hash = '')} aria-label={t('common.close')} title={t('common.close')}>
            <X size={20} />
          </button>
        </div>
      </header>

      <section className="projector-hero">
        <div className="projector-phase">
          {index > 0 && index <= PLAYABLE_PHASES && <span className="projector-step">{t('shell.stage', { n: index, total: PLAYABLE_PHASES })}</span>}
          <h1>{t(`phase.${game.phase}` as TKey)}</h1>
          <p className="projector-goal">
            <Target size={28} />
            {t(`rules.${game.phase}.goal` as TKey)}
          </p>
        </div>
        {left !== null && (
          <div className={urgent ? 'projector-timer urgent' : left > 0 ? 'projector-timer' : 'projector-timer done'} role="timer">
            {left > 0 ? formatLeft(left) : t('shell.timeUp')}
          </div>
        )}
      </section>

      {ordered.length > 0 && (
        <section className="projector-tables">
          {ordered.map((row) => {
            const lagging = isLagging(row, avg, ordered.length);
            const done = row.progress.percent >= 100;
            return (
              <article key={row.team.id} className={`projector-table${lagging ? ' lagging' : ''}${done ? ' done' : ''}`}>
                <div className="projector-table-head">
                  <strong>{row.team.name}</strong>
                  {done ? <CircleCheck size={26} /> : lagging ? <TriangleAlert size={26} /> : null}
                </div>
                <div className="projector-pct num">{row.progress.percent}%</div>
                <div className={`bar big${done ? ' ok' : lagging ? ' over' : ''}`}>
                  <span style={{ width: `${row.progress.percent}%` }} />
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
