import { Activity, CircleCheck, Lightbulb, RefreshCw, Trophy, TriangleAlert } from 'lucide-react';
import { useT, type TKey } from '../../i18n/prefs';
import { spendOf } from '../../lib/game';
import { isLagging, useTablesProgress } from '../../lib/useTablesProgress';
import { verticalStyle } from '../../lib/verticals';
import type { Game, Team } from '../../lib/types';
import { Empty, money } from '../../ui/kit';

// Сводка по всем столам: прогресс текущего этапа (кто отстаёт), состояние и запросы к HQ.
export function Overview({ game, teams }: { game: Game; teams: Team[] }) {
  const t = useT();
  // Живое обновление: ведущий видит прогресс столов без перезагрузки.
  const { data, rows, avg, settings, error, reload: load } = useTablesProgress(game, teams, 'admin-overview');
  const teamName = (id: string) => teams.find((x) => x.id === id)?.name ?? '—';

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
            {rows.map((row) => {
              const { team, progress } = row;
              const lagging = isLagging(row, avg, rows.length);
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
                      {spendOf(state.purchases, state.trainings, settings).total} / {settings.budget}
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
