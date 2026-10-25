import { useCallback, useEffect, useState } from 'react';
import { errText } from '../lib/errors';
import { supabase } from '../lib/supabase';
import type { AuditEntry, Game } from '../lib/types';

const PAGE_SIZE = 200;
const NO_GAME = 'none';

const ACTION_LABEL: Record<string, string> = {
  user_registered: 'Регистрация участника',
  user_team_changed: 'Смена команды',
  user_role_changed: 'Смена роли',
  user_game_changed: 'Смена игры',
  team_created: 'Команда создана',
  team_updated: 'Команда изменена',
  team_deleted: 'Команда удалена',
  game_created: 'Игра создана',
  game_activated: 'Игра запущена',
  game_finished: 'Игра завершена',
  split_evenly: 'Разделено поровну',
  phase_changed: 'Смена раунда',
  settings_changed: 'Изменены правила',
  placement_set: 'Клиент размещён',
  placement_removed: 'Клиент снят с доски',
  kam_spec_set: 'Специализация KAM',
  purchase_pending: 'Заявка на покупку',
  purchase_approved: 'Покупка проведена',
  purchase_rejected: 'Заявка отклонена',
  purchase_cancelled: 'Покупка отменена',
  hq_request_created: 'Запрос к HQ',
  hq_request_priced: 'Запрос к HQ оценён',
  hq_request_deleted: 'Запрос к HQ удалён',
  meeting_set: 'Результат встречи',
  meeting_removed: 'Результат встречи удалён',
};

// Короткое описание деталей записи: стол, клиент, позиция.
function describe(d: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ['team', 'username', 'name', 'client', 'item', 'bucket', 'spec', 'outcome'] as const) {
    const v = d[key];
    if (typeof v === 'string' && v) parts.push(v);
    else if (typeof v === 'number') parts.push(String(v));
  }
  if (Array.isArray(d.targets) && d.targets.length) parts.push(d.targets.join(', '));
  if (typeof d.kam === 'number') parts.push(`KAM ${d.kam}`);
  if (typeof d.cost === 'number') parts.push(`${d.cost} мон.`);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

interface GroupData {
  entries: AuditEntry[];
  actors: Record<string, string>;
}

function AuditGroup({ title, gameId, refreshKey }: { title: string; gameId: string; refreshKey: number }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GroupData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    let query = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(PAGE_SIZE);
    query = gameId === NO_GAME ? query.is('game_id', null) : query.eq('game_id', gameId);
    const res = await query;
    if (res.error) {
      setError(errText(res.error));
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
  }, [gameId]);

  // Подгружаем только раскрытую группу и обновляем её при изменениях.
  useEffect(() => {
    if (open) void fetchEntries();
  }, [open, refreshKey, fetchEntries]);

  return (
    <details className="audit-group" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{title}</summary>
      {open && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {open && !data && !error && <p className="muted">Загрузка…</p>}
      {open && data && data.entries.length === 0 && <p className="muted">Записей нет.</p>}
      {open && data && data.entries.length > 0 && (
        <ul className="list audit">
          {data.entries.map((a) => {
            const who = a.actor_id ? (data.actors[a.actor_id] ?? 'неизвестно') : 'система';
            return (
              <li key={a.id}>
                <time dateTime={a.created_at}>{new Date(a.created_at).toLocaleString('ru-RU')}</time>{' '}
                <strong>{ACTION_LABEL[a.action] ?? a.action}</strong>
                {describe(a.details)} <span className="muted">({who})</span>
              </li>
            );
          })}
        </ul>
      )}
      {open && data && data.entries.length === PAGE_SIZE && (
        <p className="muted">Показаны последние {PAGE_SIZE} записей.</p>
      )}
    </details>
  );
}

export function AuditSection({ refreshKey }: { refreshKey: number }) {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await supabase.from('games').select('*').order('created_at', { ascending: false });
      if (cancelled) return;
      if (res.error) setError(errText(res.error));
      else {
        setError(null);
        setGames((res.data ?? []) as Game[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <section className="card">
      <h2>Аудит по играм</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {games.map((g) => (
        <AuditGroup
          key={g.id}
          gameId={g.id}
          refreshKey={refreshKey}
          title={`${g.name}${g.is_active ? ' (текущая)' : ''} · ${new Date(g.created_at).toLocaleDateString('ru-RU')}`}
        />
      ))}
      <AuditGroup gameId={NO_GAME} refreshKey={refreshKey} title="Вне игр (админ, старые записи)" />
    </section>
  );
}
