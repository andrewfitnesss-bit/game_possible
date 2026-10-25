import { CircleAlert } from 'lucide-react';
import { useAuth } from './auth';
import { AppShell } from './components/layout/AppShell';
import { AdminPage } from './pages/AdminPage';
import { CuratorPage } from './pages/CuratorPage';
import { LoginPage } from './pages/LoginPage';
import { TeamPage } from './pages/TeamPage';
import { WaitingPage } from './pages/WaitingPage';
import { Loading } from './ui/kit';

function Screen() {
  const { profile, signOut } = useAuth();

  if (!profile) {
    return (
      <div className="card waiting">
        <div className="waiting-icon">
          <CircleAlert />
        </div>
        <h2>Профиль не найден</h2>
        <p className="muted">Аккаунт есть, но профиль не создан. Проверьте, что SQL-схема применена в Supabase.</p>
        <button className="btn btn-secondary" onClick={() => void signOut()}>
          Выйти
        </button>
      </div>
    );
  }

  if (profile.role === 'superadmin') return <AdminPage />;
  if (profile.role === 'curator') return <CuratorPage />;
  if (!profile.team_id) return <WaitingPage />;
  return <TeamPage />;
}

export function App() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <LoginPage />;
  return (
    <AppShell>
      <Screen />
    </AppShell>
  );
}
