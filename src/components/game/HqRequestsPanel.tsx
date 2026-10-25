import { useState, type FormEvent } from 'react';
import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { verticalStyle } from '../../lib/verticals';
import type { Client, GameSettings, HqRequest, Purchase } from '../../lib/types';
import { useConfirm } from '../../ui/Confirm';
import { Empty } from '../../ui/kit';
import type { WorkspaceActions } from './actions';

interface Props {
  requests: HqRequest[];
  purchases: Purchase[];
  clients: Client[];
  settings: GameSettings;
  canCreate: boolean;
  staff: boolean;
  busy: boolean;
  actions: WorkspaceActions;
}

const PRIORITY = {
  1: { label: 'Высокий', cls: 'badge badge-danger' },
  2: { label: 'Средний', cls: 'badge badge-warning' },
  3: { label: 'Низкий', cls: 'badge' },
} as const;

export function HqRequestsPanel({ requests, purchases, clients, settings, canCreate, staff, busy, actions }: Props) {
  const ask = useConfirm();
  const [title, setTitle] = useState('');
  const [barrier, setBarrier] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [priority, setPriority] = useState(2);
  const [prices, setPrices] = useState<Record<number, string>>({});

  const status = (id: number) => purchases.find((p) => p.request_id === id && (p.status === 'approved' || p.status === 'pending'))?.status;
  const inGame = clients.filter((c) => c.in_game);
  const canAdd = canCreate && requests.length < settings.max_hq_requests;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await actions.createHqRequest(title, barrier, targets, priority)) {
      setTitle('');
      setBarrier('');
      setTargets([]);
      setPriority(2);
    }
  }

  async function remove(r: HqRequest) {
    const ok = await ask({ title: 'Удалить запрос?', message: r.title, confirmLabel: 'Удалить', danger: true });
    if (ok !== null) void actions.deleteHqRequest(r.id);
  }

  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Lightbulb size={20} />
            <div>
              <h2>Запросы к HQ вне каталога</h2>
              <div className="card-sub">
                {requests.length} из {settings.max_hq_requests}. Организаторы оценивают запрос (обычно 7–10 монет), после
                этого его можно купить в магазине.
              </div>
            </div>
          </div>
        </div>
        {requests.length === 0 && <Empty title="Запросов пока нет">Опишите, какой помощи от HQ не хватает в каталоге.</Empty>}
        <div className="pur-list">
          {requests.map((r) => {
            const st = status(r.id);
            return (
              <article key={r.id} className="pur">
                <span className="pur-icon">
                  <Lightbulb size={18} />
                </span>
                <div>
                  <div className="row">
                    <span className="pur-title">{r.title}</span>
                    <span className={PRIORITY[r.priority].cls}>{PRIORITY[r.priority].label}</span>
                  </div>
                  {r.barrier && <div className="pur-just">{r.barrier}</div>}
                  {r.targets.length > 0 && (
                    <div className="targets-line">
                      {r.targets.map((t) => (
                        <span key={t} className="code-badge" style={verticalStyle(t)}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="pur-side">
                  {r.price !== null ? <span className="coin">{r.price}</span> : <span className="badge">не оценён</span>}
                  {st && <span className={st === 'approved' ? 'badge badge-success' : 'badge badge-warning'}>{st === 'approved' ? 'куплен' : 'заявка'}</span>}
                  {!st && (
                    <div className="pur-actions">
                      {staff && (
                        <>
                          <input
                            type="number"
                            min={0}
                            max={25}
                            className="input select-sm price-input"
                            aria-label="Цена в монетах"
                            value={prices[r.id] ?? (r.price ?? '')}
                            onChange={(e) => setPrices((p) => ({ ...p, [r.id]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            disabled={busy}
                            onClick={() => {
                              const v = prices[r.id] ?? String(r.price ?? '');
                              void actions.priceHqRequest(r.id, v === '' ? null : Number(v));
                            }}
                          >
                            Оценить
                          </button>
                        </>
                      )}
                      {(staff || canCreate) && (
                        <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void remove(r)} aria-label="Удалить запрос">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <Plus size={20} />
          <h2>Новый запрос</h2>
        </div>
        {!canCreate ? (
          <Empty title="Сейчас запросы не создаются">Капитан добавляет запросы в раунде R2.2.</Empty>
        ) : !canAdd ? (
          <Empty title="Лимит запросов исчерпан">Удалите неоценённый запрос, чтобы добавить новый.</Empty>
        ) : (
          <form className="form" onSubmit={(e) => void submit(e)}>
            <label className="field">
              Что нужно от HQ
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="Например: локальный SOC playbook" />
            </label>
            <label className="field">
              Какой барьер снимает
              <textarea value={barrier} onChange={(e) => setBarrier(e.target.value)} maxLength={1000} rows={3} placeholder="Барьер клиента и как будем применять" />
            </label>
            <div className="field">
              Клиенты
              <div className="target-grid compact">
                {inGame.map((c) => {
                  const on = targets.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      className="target"
                      aria-pressed={on}
                      title={c.name}
                      onClick={() => setTargets((t) => (on ? t.filter((x) => x !== c.code) : [...t, c.code]))}
                    >
                      <span className="code-badge" style={verticalStyle(c.code)}>
                        {c.code}
                      </span>
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="field">
              Приоритет
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={1}>Высокий</option>
                <option value={2}>Средний</option>
                <option value={3}>Низкий</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
              <Plus size={16} /> Добавить запрос
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
