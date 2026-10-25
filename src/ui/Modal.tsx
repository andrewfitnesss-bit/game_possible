import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Свой заголовок вместо стандартного (например, цветная шапка карточки клиента). */
  header?: ReactNode;
  footer?: ReactNode;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}

// Модальное окно на нативном <dialog>: фокус, Esc и подложка из коробки. На телефоне — нижний лист.
export function Modal({ title, subtitle, header, footer, width, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      style={width ? ({ '--modal-w': `${width}px` } as CSSProperties) : undefined}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
    >
      <div className="modal-panel">
        {header ?? (
          <div className="modal-head">
            <div className="grow">
              {title && <h2>{title}</h2>}
              {subtitle && <div className="card-sub">{subtitle}</div>}
            </div>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => ref.current?.close()} aria-label="Закрыть">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

/** Закрывает ближайший открытый диалог (для кнопок «Отмена» внутри Modal). */
export function closeDialog(el: HTMLElement | null) {
  el?.closest('dialog')?.close();
}
