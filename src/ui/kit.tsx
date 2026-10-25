import type { CSSProperties, ReactNode } from 'react';
import { Inbox } from 'lucide-react';

// Мелкие презентационные компоненты, общие для всех экранов.

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  pills,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  pills?: boolean;
}) {
  return (
    <div className={pills ? 'tabs tabs-pills' : 'tabs'} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          {t.label}
          {t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  icon,
  value,
  max,
  suffix,
  segments,
}: {
  label: string;
  icon?: ReactNode;
  value: number;
  max?: number;
  suffix?: string;
  /** Показать шкалу из отдельных делений (для небольших лимитов вроде SSM). */
  segments?: boolean;
}) {
  const over = max !== undefined && value > max;
  const ratio = max ? Math.min(value / max, 1) : 0;
  const state = over ? 'over' : max !== undefined && value === max ? 'full' : '';
  return (
    <div className={over ? 'stat over' : 'stat'}>
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div className="stat-value">
        {formatNum(value)}
        {max !== undefined && <small> / {formatNum(max)}</small>}
        {suffix && <small> {suffix}</small>}
      </div>
      {max !== undefined &&
        (segments ? (
          <div className="segments" aria-hidden>
            {Array.from({ length: Math.max(max, value) }, (_, i) => (
              <span key={i} className={i < value ? (i >= max ? 'over' : 'on') : ''} />
            ))}
          </div>
        ) : (
          <div className={`bar ${state}`} role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-label={label}>
            <span style={{ width: `${ratio * 100}%` }} />
          </div>
        ))}
    </div>
  );
}

export function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

export function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox />}
      <strong>{title}</strong>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Loading({ text = 'Загрузка…' }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <div className="spinner" />
      {text}
    </div>
  );
}

const AVATAR_COLORS = ['#e8590c', '#1971c2', '#2b8a3e', '#7048e8', '#c2255c', '#0c8599', '#e67700', '#5c7cfa'];

export function Avatar({ name, size }: { name: string; size?: 'sm' | 'lg' }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return (
    <span className={size ? `avatar avatar-${size}` : 'avatar'} style={{ '--a': color } as CSSProperties} aria-hidden>
      {initials}
    </span>
  );
}
