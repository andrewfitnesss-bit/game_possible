import { useState } from 'react';
import { DoorOpen, Hourglass, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth';
import { ClientCatalog } from '../components/game/ClientCatalog';
import { useT } from '../i18n/prefs';
import { errText } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useConfirm } from '../ui/Confirm';
import { useToast } from '../ui/Toast';

export function WaitingPage({ curator, finished }: { curator?: boolean; finished?: boolean }) {
  const { refreshProfile } = useAuth();
  const t = useT();
  const ask = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Игрок завершённой игры сам освобождает место и ждёт распределения в новую.
  async function leave() {
    const ok = await ask({
      title: t('waiting.leaveTitle'),
      message: t('waiting.leaveText'),
      confirmLabel: t('waiting.leave'),
    });
    if (ok === null) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('leave_finished_game');
      if (error) toast.error(errText(error, t));
      else toast.success(t('waiting.left'));
    } finally {
      await refreshProfile();
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card waiting">
        <div className="waiting-icon">
          <Hourglass />
        </div>
        <h2>{finished ? t('waiting.finishedTitle') : curator ? t('waiting.curatorTitle') : t('waiting.title')}</h2>
        <p className="muted">
          {finished ? t('waiting.finishedText') : curator ? t('waiting.curatorText') : t('waiting.text')}
        </p>
        <div className="row center-row">
          {finished && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void leave()}>
              <DoorOpen size={16} />
              {t('waiting.leave')}
            </button>
          )}
          <button className="btn btn-secondary" disabled={busy} onClick={() => void refreshProfile()}>
            <RefreshCw size={16} />
            {t('waiting.check')}
          </button>
        </div>
      </div>
      {!finished && <ClientCatalog />}
    </>
  );
}
