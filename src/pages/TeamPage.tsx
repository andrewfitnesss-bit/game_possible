import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { TeamWorkspace } from '../components/game/TeamWorkspace';

// Участник и капитан видят свой стол; правит доску и оформляет заявки только капитан.
export function TeamPage() {
  const { profile } = useAuth();
  if (!profile?.team_id) return null;
  return (
    <>
      <Header />
      <TeamWorkspace teamId={profile.team_id} mode={profile.role === 'captain' ? 'captain' : 'viewer'} />
    </>
  );
}
