import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, ScrollText } from 'lucide-react';
import { usePrefs, type T, type TKey } from '../i18n/prefs';
import { errText } from '../lib/errors';
import { supabase } from '../lib/supabase';
import type { AuditEntry, Game } from '../lib/types';

const PAGE_SIZE = 200;
const NO_GAME = 'none';

// Короткое описание деталей записи: стол, клиент, позиция.
function describe(d: Record<string, unknown>, t: T): string {
  const parts: string[] = [];
  for (const key of ['team', 'username', 'name', 'client', 'item', 'bucket', 'spec', 'outcome', 'mode', 'players'] as const) {
    const v = d[key];
    if (typeof v === 'string' && v) parts.push(v);
    else if (typeof v === 'number') parts.push(String(v));
  }
  if (Array.isArray(d.targets) && d.targets.length) parts.push(d.targets.join(', '));
  if (typeof d.kam === 'number') parts.push(`KAM ${d.kam}`);
  if (typeof d.cost === 'number') parts.push(t('common.coins', { n: d.cost }));
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

function actionLabel(action: string, t: T): string {
  const key = `audit.${action}` as TKey;
  const text = t(key);
  return text === key ? action : text;
}

interface GroupData {
  entries: AuditEntry[];
  actors: Record<string, string>;
}

function AuditGroup({ title, gameId, refreshKey }: { title: string; gameId: string; refreshKey: number }) {
  const { t, lang } = usePrefs();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GroupData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    let query = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(PAGE_SIZE);
    query = gameId === NO_GAME ? query.is('game_id', null) : query.eq('game_id', gameId);
    const res = await query;
    if (res.error) {
      setError(errText(res.error, t));
      return;
    }
    const entries = (res.data ?? []) as AuditEntry[];
    const ids = [...new Set(entries.map((e) => e.actor_id).filter((x): x is string => Boolean(x)))];
    const actors: Record<string, string> = {};
    if (ids.length > 0) {
      const p = await supabase.from('profiles').select('id, username, full_name').in('id', ids);
      for (const row of (p.data ?? []) as { id: string; username: string; full_name: string }[]) {
        actors[row.id] = row.full_name || row.username;
      }
    }
    setError(null);
    setData({ entries, actors });
  }, [gameId, t]);

  // Подгружаем только раскрытую группу и обновляем её при изменениях.
  useEffect(() => {
    if (open) void fetchEntries();
  }, [open, refreshKey, fetchEntries]);

  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';

  return (
    <details className="audit-group" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <ChevronRight size={16} className="chevron" />
        {title}
      </summary>
      <div className="audit-body">
        {open && error && (
          <div className="callout callout-danger" role="alert">
            {error}
          </div>
        )}
        {open && !data && !error && <p className="muted small">{t('common.loading')}</p>}
        {open && data && data.entries.length === 0 && <p className="muted small">{t('audit.empty')}</p>}
        {open &&
          data &&
          data.entries.map((a) => {
            const who = a.actor_id ? (data.actors[a.actor_id] ?? t('audit.unknown')) : t('audit.system');
            return (
              <div key={a.id} className="audit-row">
                <time dateTime={a.created_at}>
                  {new Date(a.created_at).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </time>
                <div>
                  <strong>{actionLabel(a.action, t)}</strong>
                  <span className="text-2">{describe(a.details, t)}</span> <span className="muted">· {who}</span>
                </div>
              </div>
            );
          })}
        {open && data && data.entries.length === PAGE_SIZE && <p className="muted small">{t('audit.lastN', { n: PAGE_SIZE })}</p>}
      </div>
    </details>
  );
}

export function AuditSection({ refreshKey }: { refreshKey: number }) {
  const { t, lang } = usePrefs();
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await supabase.from('games').select('*').order('created_at', { ascending: false });
      if (cancelled) return;
      if (res.error) setError(errText(res.error, t));
      else {
        setError(null);
        setGames((res.data ?? []) as Game[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, t]);

  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';

  return (
    <section className="card">
      <div className="card-title">
        <ScrollText size={20} />
        <div>
          <h2>{t('audit.title')}</h2>
          <div className="card-sub">{t('audit.sub')}</div>
        </div>
      </div>
      {error && (
        <div className="callout callout-danger" role="alert">
          {error}
        </div>
      )}
      {games.map((g) => (
        <AuditGroup
          key={g.id}
          gameId={g.id}
          refreshKey={refreshKey}
          title={`${g.name}${g.is_active ? t('audit.current') : ''} · ${new Date(g.created_at).toLocaleDateString(locale)}`}
        />
      ))}
      <AuditGroup gameId={NO_GAME} refreshKey={refreshKey} title={t('audit.outside')} />
    </section>
  );
}
