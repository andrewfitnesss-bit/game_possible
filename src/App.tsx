import { useAuth } from './auth';
import { Footer } from './components/Footer';
import { AdminPage } from './pages/AdminPage';
import { CuratorPage } from './pages/CuratorPage';
import { LoginPage } from './pages/LoginPage';
import { TeamPage } from './pages/TeamPage';
import { WaitingPage } from './pages/WaitingPage';

function Screen() {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) return <p className="center muted">Загрузка…</p>;
  if (!session) return <LoginPage />;

  if (!profile) {
    return (
      <div className="card narrow">
        <h2>Профиль не найден</h2>
        <p className="muted">Аккаунт есть, но профиль не создан. Проверьте, что SQL-схема применена в Supabase.</p>
        <button onClick={() => void signOut()}>Выйти</button>
      </div>
    );
  }

  if (profile.role === 'superadmin') return <AdminPage />;
  if (profile.role === 'curator') return <CuratorPage />;
  if (!profile.team_id) return <WaitingPage />;
  return <TeamPage />;
}

export function App() {
  return (
    <div className="layout">
      <main>
        <Screen />
      </main>
      <Footer />
    </div>
  );
}
