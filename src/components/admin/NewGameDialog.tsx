import { useState, type FormEvent } from 'react';
import { RefreshCcw, Rocket, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { useT, type TKey } from '../../i18n/prefs';
import type { Game } from '../../lib/types';
import { Modal, closeDialog } from '../../ui/Modal';

export type StartMode = 'restart' | 'reseat' | 'empty';

const MODES: { id: StartMode; title: TKey; text: TKey; icon: typeof Users }[] = [
  { id: 'restart', title: 'admin.modeRestart', text: 'admin.modeRestartText', icon: RefreshCcw },
  { id: 'reseat', title: 'admin.modeReseat', text: 'admin.modeReseatText', icon: Users },
  { id: 'empty', title: 'admin.modeEmpty', text: 'admin.modeEmptyText', icon: UserPlus },
];

interface Props {
  current: Game | null;
  busy: boolean;
  onStart: (name: string, mode: StartMode) => Promise<boolean>;
  onClose: () => void;
}

export function NewGameDialog({ current, busy, onStart, onClose }: Props) {
  const t = useT();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<StartMode>('restart');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!name.trim()) return;
    if (await onStart(name.trim(), current ? mode : 'empty')) closeDialog(form);
  }

  return (
    <Modal title={t('admin.newGame')} width={560} onClose={onClose}>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          {t('admin.gameName')}
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder={t('admin.newGamePh')} />
        </label>

        {current && (
          <fieldset className="plain stack">
            <legend className="section-title">{t('admin.mode')}</legend>
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <label key={m.id} className={mode === m.id ? 'mode-option on' : 'mode-option'}>
                  <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} />
                  <Icon size={18} />
                  <span className="grow">
                    <strong>{t(m.title)}</strong>
                    <span className="muted small">{t(m.text)}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        {current && (
          <div className="callout callout-warning">
            <TriangleAlert size={18} />
            <span>{t('admin.finishWarn', { name: current.name })}</span>
          </div>
        )}

        <div className="row end">
          <button type="button" className="btn btn-secondary" onClick={(e) => closeDialog(e.currentTarget)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            <Rocket size={16} /> {t('admin.start')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
