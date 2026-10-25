import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { TeamWorkspace } from '../components/game/TeamWorkspace';

export function CuratorPage() {
  const { profile, refreshProfile } = useAuth();
  if (!profile?.team_id) {
    return (
      <>
        <Header />
        <div className="card narrow center">
          <h2>Вы куратор</h2>
          <p className="muted">Администратор ещё не закрепил вас за столом. Страница обновится сама.</p>
          <button className="secondary" onClick={() => void refreshProfile()}>
            Проверить сейчас
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <Header />
      <p className="secret small card">
        Конфиденциально: на этом экране видны все подсказки и скрытые эффекты. Не показывайте экран участникам.
      </p>
      <TeamWorkspace teamId={profile.team_id} mode="staff" />
    </>
  );
}
