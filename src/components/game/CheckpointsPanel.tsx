import { Check, ClipboardCheck, X } from 'lucide-react';
import { checkpoints, settingsOf } from '../../lib/game';
import type { TeamData } from '../../lib/useTeamData';

export function teamChecks(data: TeamData) {
  return checkpoints({
    clients: data.clients,
    catalog: data.catalog,
    placements: data.placements,
    kams: data.kams,
    purchases: data.purchases,
    meetings: data.meetings.length,
    settings: settingsOf(data.game),
  });
}

export function CheckpointsPanel({ data }: { data: TeamData }) {
  const groups = teamChecks(data);
  return (
    <div className="grid-auto">
      {groups.map((g) => {
        const done = g.checks.filter((c) => c.ok).length;
        return (
          <section key={g.title} className="card">
            <div className="card-head">
              <div className="card-title">
                <ClipboardCheck size={20} />
                <h2>{g.title}</h2>
              </div>
              <span className={done === g.checks.length ? 'badge badge-success' : 'badge badge-warning'}>
                {done}/{g.checks.length}
              </span>
            </div>
            <div>
              {g.checks.map((c) => (
                <div key={c.label} className="check-item">
                  <span className={c.ok ? 'check-icon ok' : 'check-icon bad'}>{c.ok ? <Check /> : <X />}</span>
                  <div>
                    <div className="strong small">{c.label}</div>
                    {c.detail && <div className="muted xsmall">{c.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
