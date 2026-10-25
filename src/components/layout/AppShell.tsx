import type { ReactNode } from 'react';
import { LogOut, Timer } from 'lucide-react';
import { useAuth } from '../../auth';
import { PHASES } from '../../lib/game';
import { formatLeft, useCountdown, useGame } from '../../lib/useGame';
import type { Game, Role } from '../../lib/types';
import { Avatar } from '../../ui/kit';

const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Супер-админ',
  captain: 'Капитан',
  member: 'Участник',
  curator: 'Куратор',
};

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const game = useGame(profile?.game_id ?? null);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              N
            </span>
            <span className="brand-text">
              <span className="brand-title">The NAL Games</span>
              <span className="brand-sub">Mission: Possible</span>
            </span>
          </div>
          <div className="game-status">{game && <GameStatus game={game} />}</div>
          {profile && (
            <div className="user-chip">
              <div className="who">
                <span className="name">{profile.full_name || profile.username}</span>
                <span className="role">{ROLE_LABEL[profile.role]}</span>
              </div>
              <Avatar name={profile.full_name || profile.username} />
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => void signOut()} aria-label="Выйти" title="Выйти">
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">The NAL Games · v{__APP_VERSION__}</footer>
    </div>
  );
}

function GameStatus({ game }: { game: Game }) {
  const left = useCountdown(game.phase_ends_at);
  const index = PHASES.findIndex((p) => p.id === game.phase);
  const phase = PHASES[index];
  const playable = PHASES.length - 2; // без «ожидания» и «завершена»
  return (
    <div className="status-pill" role="status" aria-live="off">
      <span className="phase-step">{index > 0 && index <= playable ? `Этап ${index}/${playable}` : game.name}</span>
      <span className="phase-name">{phase?.short ?? game.phase}</span>
      {left !== null &&
        (left > 0 ? (
          <span className={left <= 60_000 ? 'timer urgent' : 'timer'} aria-label="Осталось времени">
            <Timer size={16} />
            {formatLeft(left)}
          </span>
        ) : (
          <span className="timer done">время вышло</span>
        ))}
    </div>
  );
}
