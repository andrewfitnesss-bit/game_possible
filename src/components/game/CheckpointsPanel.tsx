import { checkpoints, settingsOf } from '../../lib/game';
import type { TeamData } from '../../lib/useTeamData';

export function CheckpointsPanel({ data }: { data: TeamData }) {
  const groups = checkpoints({
    clients: data.clients,
    catalog: data.catalog,
    placements: data.placements,
    kams: data.kams,
    purchases: data.purchases,
    meetings: data.meetings.length,
    settings: settingsOf(data.game),
  });
  return (
    <section className="card">
      <h2>Контрольные точки</h2>
      <div className="checkpoints">
        {groups.map((g) => (
          <div key={g.title}>
            <h3>{g.title}</h3>
            <ul className="list">
              {g.checks.map((c) => (
                <li key={c.label} className={c.ok ? 'check-ok' : 'check-bad'}>
                  {c.ok ? '✓' : '✗'} {c.label}
                  {c.detail && <span className="muted small"> — {c.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
