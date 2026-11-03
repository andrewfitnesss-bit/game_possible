import { Hourglass, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth';
import { useT } from '../i18n/prefs';

export function WaitingPage({ curator }: { curator?: boolean }) {
  const { refreshProfile } = useAuth();
  const t = useT();
  return (
    <div className="card waiting">
      <div className="waiting-icon">
        <Hourglass />
      </div>
      <h2>{curator ? t('waiting.curatorTitle') : t('waiting.title')}</h2>
      <p className="muted">{curator ? t('waiting.curatorText') : t('waiting.text')}</p>
      <button className="btn btn-secondary" onClick={() => void refreshProfile()}>
        <RefreshCw size={16} />
        {t('waiting.check')}
      </button>
    </div>
  );
}
