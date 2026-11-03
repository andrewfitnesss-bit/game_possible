import { useState, type FormEvent } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { useT } from '../../i18n/prefs';

interface Props {
  name: string;
  canRename: boolean;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
}

// Название стола в шапке; капитан и куратор переименовывают его прямо здесь.
export function TeamName({ name, canRename, busy, onRename }: Props) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (next === name) {
      setEditing(false);
      return;
    }
    if (await onRename(next)) setEditing(false);
  }

  if (editing) {
    return (
      <form className="team-rename" onSubmit={(e) => void submit(e)}>
        <input
          className="input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          minLength={2}
          maxLength={40}
          aria-label={t('ws.rename')}
        />
        <button type="submit" className="btn btn-primary btn-icon btn-sm" disabled={busy || value.trim().length < 2} aria-label={t('common.save')}>
          <Check size={16} />
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(false)} aria-label={t('common.cancel')}>
          <X size={16} />
        </button>
      </form>
    );
  }

  return (
    <div className="team-name-row">
      <h1 className="team-name">{name}</h1>
      {canRename && (
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
          aria-label={t('ws.rename')}
          title={t('ws.rename')}
        >
          <Pencil size={16} />
        </button>
      )}
    </div>
  );
}
