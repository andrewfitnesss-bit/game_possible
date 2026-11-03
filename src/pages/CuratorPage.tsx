import { EyeOff } from 'lucide-react';
import { useAuth } from '../auth';
import { TeamWorkspace } from '../components/game/TeamWorkspace';
import { useT } from '../i18n/prefs';
import { WaitingPage } from './WaitingPage';

export function CuratorPage() {
  const { profile } = useAuth();
  const t = useT();
  if (!profile?.team_id) return <WaitingPage curator />;
  return (
    <>
      <div className="callout callout-secret">
        <EyeOff size={18} />
        <div>
          <strong>{t('curator.secretStrong')}</strong> {t('curator.secretText')}
        </div>
      </div>
      <TeamWorkspace teamId={profile.team_id} mode="staff" />
    </>
  );
}
