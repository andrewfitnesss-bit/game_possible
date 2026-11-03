import { Hourglass, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth';
import { useT } from '../i18n/prefs';

export function WaitingPage({ curator, finished }: { curator?: boolean; finished?: boolean }) {
  const { refreshProfile } = useAuth();
  const t = useT();
  return (
    <div className="card waiting">
      <div className="waiting-icon">
        <Hourglass />
      </div>
      <h2>{finished ? t('waiting.finishedTitle') : curator ? t('waiting.curatorTitle') : t('waiting.title')}</h2>
      <p className="muted">{finished ? t('waiting.finishedText') : curator ? t('waiting.curatorText') : t('waiting.text')}</p>
      <button className="btn btn-secondary" onClick={() => void refreshProfile()}>
        <RefreshCw size={16} />
        {t('waiting.check')}
      </button>
    </div>
  );
}
