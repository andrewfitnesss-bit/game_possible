import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Modal, closeDialog } from './Modal';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Если задано — в диалоге есть поле ввода, результат промиса — введённый текст. */
  input?: { label: string; placeholder?: string; required?: boolean };
}

type Ask = (opts: ConfirmOptions) => Promise<string | null>;
const ConfirmContext = createContext<Ask | null>(null);

// Замена window.confirm / window.prompt: ask() возвращает текст (или '' без поля) либо null при отмене.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [text, setText] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);
  const result = useRef<string | null>(null);

  const ask = useCallback<Ask>((o) => {
    setText('');
    result.current = null;
    setOpts(o);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function onClose() {
    resolver.current?.(result.current);
    resolver.current = null;
    setOpts(null);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (opts?.input?.required && text.trim().length < 3) return;
    result.current = text.trim();
    closeDialog(e.currentTarget);
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {opts && (
        <Modal title={opts.title} width={460} onClose={onClose}>
          <form className="form" onSubmit={submit}>
            {opts.message && <div className="text-2">{opts.message}</div>}
            {opts.input && (
              <label className="field">
                {opts.input.label}
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={opts.input.placeholder}
                  maxLength={500}
                  rows={3}
                />
                {opts.input.required && <span className="hint-text">Минимум 3 символа</span>}
              </label>
            )}
            <div className="row end">
              <button type="button" className="btn btn-secondary" onClick={(e) => closeDialog(e.currentTarget)}>
                Отмена
              </button>
              <button
                type="submit"
                className={opts.danger ? 'btn btn-danger' : 'btn btn-primary'}
                disabled={Boolean(opts.input?.required) && text.trim().length < 3}
              >
                {opts.confirmLabel ?? 'Подтвердить'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm вне ConfirmProvider');
  return ctx;
}
