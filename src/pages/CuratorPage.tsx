import { EyeOff } from 'lucide-react';
import { useAuth } from '../auth';
import { TeamWorkspace } from '../components/game/TeamWorkspace';
import { WaitingPage } from './WaitingPage';

export function CuratorPage() {
  const { profile } = useAuth();
  if (!profile?.team_id) {
    return <WaitingPage title="Вы куратор" text="Администратор ещё не закрепил вас за столом. Страница обновится сама." />;
  }
  return (
    <>
      <div className="callout callout-secret">
        <EyeOff size={18} />
        <div>
          <strong>Конфиденциально.</strong> На этом экране видны все подсказки и скрытые эффекты — не показывайте его
          участникам.
        </div>
      </div>
      <TeamWorkspace teamId={profile.team_id} mode="staff" />
    </>
  );
}
