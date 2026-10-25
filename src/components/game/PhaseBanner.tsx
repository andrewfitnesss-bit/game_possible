import { useEffect, useState } from 'react';
import { phaseLabel } from '../../lib/game';
import type { Game } from '../../lib/types';

function formatLeft(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PhaseBanner({ game }: { game: Game }) {
  const [now, setNow] = useState(() => Date.now());
  const endsAt = game.phase_ends_at ? Date.parse(game.phase_ends_at) : null;

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const left = endsAt ? endsAt - now : null;
  return (
    <div className="phase-banner" role="status">
      <span>
        <span className="muted">{game.name} · </span>
        <strong>{phaseLabel(game.phase)}</strong>
      </span>
      {left !== null && (
        <span className={left <= 60_000 ? 'timer urgent' : 'timer'} aria-label="Осталось времени">
          {left > 0 ? formatLeft(left) : 'время вышло'}
        </span>
      )}
    </div>
  );
}
