import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { useAuth } from './auth';
import { AppShell } from './components/layout/AppShell';
import { useT } from './i18n/prefs';
import { useGame } from './lib/useGame';
import { AdminPage } from './pages/AdminPage';
import { CuratorPage } from './pages/CuratorPage';
import { LoginPage } from './pages/LoginPage';
import { PROJECTOR_HASH, ProjectorPage } from './pages/ProjectorPage';
import { TeamPage } from './pages/TeamPage';
import { WaitingPage } from './pages/WaitingPage';
import { Loading } from './ui/kit';

function Screen() {
  const { profile, signOut } = useAuth();
  const t = useT();
  const game = useGame(profile?.game_id ?? null);

  if (!profile) {
    return (
      <div className="card waiting">
        <div className="waiting-icon">
          <CircleAlert />
        </div>
        <h2>{t('app.profileMissingTitle')}</h2>
        <p className="muted">{t('app.profileMissingText')}</p>
        <button className="btn btn-secondary" onClick={() => void signOut()}>
          {t('shell.logout')}
        </button>
      </div>
    );
  }

  if (profile.role === 'superadmin') return <AdminPage />;
  // Игрок остался в завершённой игре — ждёт, пока ведущий переведёт его в новую.
  if (game && !game.is_active) return <WaitingPage finished />;
  if (profile.role === 'curator') return <CuratorPage />;
  if (!profile.team_id) return <WaitingPage />;
  return <TeamPage />;
}

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const { session, loading, profile } = useAuth();
  const t = useT();
  const hash = useHash();
  if (loading) return <Loading text={t('common.loading')} />;
  if (!session) return <LoginPage />;
  // Экран для проектора — только у супер-админа, без шапки и меню.
  if (hash === PROJECTOR_HASH && profile?.role === 'superadmin') return <ProjectorPage />;
  return (
    <AppShell>
      <Screen />
    </AppShell>
  );
}
