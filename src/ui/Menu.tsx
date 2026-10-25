import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

export type MenuEntry =
  | { type: 'label'; label: string }
  | { type: 'sep' }
  | { type: 'item'; label: ReactNode; icon?: ReactNode; checked?: boolean; disabled?: boolean; onSelect: () => void };

interface Props {
  trigger: (props: { onClick: (e: React.MouseEvent<HTMLElement>) => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode;
  entries: MenuEntry[];
  label: string;
}

// Выпадающее меню в портале с фиксированной позицией: не обрезается колонками и прокруткой.
export function Menu({ trigger, entries, label }: Props) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const m = menuRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, anchor.right - m.width), window.innerWidth - m.width - 8);
    const below = anchor.bottom + 6;
    const top = below + m.height > window.innerHeight - 8 ? Math.max(8, anchor.top - m.height - 6) : below;
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    menuRef.current?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus();
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      // Клики по самому меню и по кнопке-триггеру обрабатываются их собственными onClick.
      if (e.type === 'pointerdown' && (menuRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node))) return;
      setAnchor(null);
      setPos(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [anchor]);

  return (
    <>
      {trigger({
        onClick: (e) => {
          e.stopPropagation();
          triggerRef.current = e.currentTarget;
          const rect = e.currentTarget.getBoundingClientRect();
          setPos(null);
          setAnchor((a) => (a ? null : rect));
        },
        'aria-expanded': Boolean(anchor),
        'aria-haspopup': 'menu',
      })}
      {anchor &&
        createPortal(
          <div
            ref={menuRef}
            className="menu"
            role="menu"
            aria-label={label}
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
          >
            {entries.map((e, i) => {
              if (e.type === 'label') return <div key={i} className="menu-label">{e.label}</div>;
              if (e.type === 'sep') return <div key={i} className="menu-sep" />;
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitemradio"
                  aria-checked={Boolean(e.checked)}
                  className="menu-item"
                  disabled={e.disabled}
                  onClick={() => {
                    setAnchor(null);
                    setPos(null);
                    if (!e.checked) e.onSelect();
                  }}
                >
                  {e.icon}
                  <span className="grow">{e.label}</span>
                  {e.checked && <Check size={16} className="check-mark" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
