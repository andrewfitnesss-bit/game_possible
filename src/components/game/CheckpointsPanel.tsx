import { Check, ClipboardCheck, X } from 'lucide-react';
import { useT } from '../../i18n/prefs';
import { checkpoints } from '../../lib/game';
import { teamState, type TeamData } from '../../lib/useTeamData';

export function teamChecks(data: TeamData) {
  return checkpoints(teamState(data));
}

export function CheckpointsPanel({ data }: { data: TeamData }) {
  const t = useT();
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
                <h2>{t(g.title)}</h2>
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
                    <div className="strong small">{t(c.label, c.vars)}</div>
                    {c.detail && <div className="muted xsmall">{t(c.detail.key, c.detail.vars)}</div>}
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
