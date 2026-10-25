import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, RefreshCw, Trophy } from 'lucide-react';
import { capacityUsed, settingsOf, spendOf } from '../../lib/game';
import { errText } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import { verticalStyle } from '../../lib/verticals';
import { Empty, money } from '../../ui/kit';
import type { Game, HqRequest, MeetingResult, Placement, Purchase, Team, TeamKam } from '../../lib/types';

interface AllData {
  placements: Placement[];
  kams: TeamKam[];
  purchases: Purchase[];
  meetings: MeetingResult[];
  requests: HqRequest[];
}


// Сводка по всем столам: состояние, запросы к HQ, заготовка под итоговый подсчёт.
export function Overview({ game, teams }: { game: Game; teams: Team[] }) {
  const [data, setData] = useState<AllData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const ids = teams.map((t) => t.id);
    if (ids.length === 0) {
      setData({ placements: [], kams: [], purchases: [], meetings: [], requests: [] });
      return;
    }
    const [p, k, pu, m, r] = await Promise.all([
      supabase.from('placements').select('*').in('team_id', ids),
      supabase.from('team_kams').select('*').in('team_id', ids),
      supabase.from('purchases').select('*').in('team_id', ids),
      supabase.from('meeting_results').select('*').in('team_id', ids),
      supabase.from('hq_requests').select('*').in('team_id', ids).order('title'),
    ]);
    const failed = [p, k, pu, m, r].find((x) => x.error);
    if (failed?.error) {
      setError(errText(failed.error));
      return;
    }
    setError(null);
    setData({
      placements: (p.data ?? []) as Placement[],
      kams: (k.data ?? []) as TeamKam[],
      purchases: (pu.data ?? []) as Purchase[],
      meetings: (m.data ?? []) as MeetingResult[],
      requests: (r.data ?? []) as HqRequest[],
    });
  }, [teams]);

  useEffect(() => {
    void load();
  }, [load]);

  const settings = settingsOf(game);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '—';

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
            <Trophy size={20} />
            <div>
              <h2>Итоги по столам</h2>
              <div className="card-sub">
                Расчёт ожидаемой выручки появится, когда будут готовы правила клиентов (05_Client_Master).
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            <RefreshCw size={14} /> Обновить
          </button>
        </div>
        {data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Стол</th>
                  <th>Active</th>
                  <th>Maint.</th>
                  <th>MidMarket</th>
                  <th>Capacity</th>
                  <th>Спец.</th>
                  <th>Монет</th>
                  <th>Заявок</th>
                  <th>Round 3</th>
                  <th>Выручка</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const pl = data.placements.filter((x) => x.team_id === t.id);
                  const km = data.kams.filter((x) => x.team_id === t.id);
                  const pu = data.purchases.filter((x) => x.team_id === t.id);
                  const mt = data.meetings.filter((x) => x.team_id === t.id);
                  return (
                    <tr key={t.id}>
                      <td className="strong">{t.name}</td>
                      <td>{pl.filter((x) => x.bucket === 'active').length}</td>
                      <td>{pl.filter((x) => x.bucket === 'maintenance').length}</td>
                      <td>{pl.filter((x) => x.bucket === 'midmarket').length}</td>
                      <td>
                        {capacityUsed(pl, km, settings)} / {settings.capacity}
                      </td>
                      <td>{km.filter((x) => x.specialization).length}</td>
                      <td>
                        {spendOf(pu).total} / {settings.budget}
                      </td>
                      <td>{pu.filter((x) => x.status === 'pending').length}</td>
                      <td>{money(mt.reduce((s, x) => s + x.amount, 0))}</td>
                      <td>
                        <span className="badge">скоро</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-title">
          <Lightbulb size={20} />
          <div>
            <h2>Запросы к HQ со всех столов</h2>
            <div className="card-sub">Повторяющиеся запросы разных столов — темы для HQ</div>
          </div>
        </div>
        {data && data.requests.length === 0 && <Empty title="Запросов пока нет" />}
        {data && data.requests.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Запрос</th>
                  <th>Стол</th>
                  <th>Клиенты</th>
                  <th>Приоритет</th>
                  <th>Цена</th>
                  <th>Куплен</th>
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
                        {r.targets.map((t) => (
                          <span key={t} className="code-badge" style={verticalStyle(t)}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{r.priority}</td>
                    <td>{r.price === null ? '—' : <span className="coin">{r.price}</span>}</td>
                    <td>
                      {data.purchases.some((p) => p.request_id === r.id && p.status === 'approved') ? (
                        <span className="badge badge-success">да</span>
                      ) : (
                        <span className="badge">нет</span>
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
