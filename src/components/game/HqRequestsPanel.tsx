import { useState, type FormEvent } from 'react';
import type { GameSettings, HqRequest, Purchase } from '../../lib/types';

interface Props {
  requests: HqRequest[];
  purchases: Purchase[];
  settings: GameSettings;
  canCreate: boolean;
  staff: boolean;
  busy: boolean;
  onCreate: (title: string, barrier: string, targets: string[], priority: number) => Promise<boolean>;
  onPrice: (id: number, price: number | null) => void;
  onDelete: (id: number) => void;
}

const PRIORITY_LABEL = { 1: 'Высокий', 2: 'Средний', 3: 'Низкий' } as const;

export function HqRequestsPanel({ requests, purchases, settings, canCreate, staff, busy, onCreate, onPrice, onDelete }: Props) {
  const [title, setTitle] = useState('');
  const [barrier, setBarrier] = useState('');
  const [targets, setTargets] = useState('');
  const [priority, setPriority] = useState(2);
  const [prices, setPrices] = useState<Record<number, string>>({});

  const bought = (id: number) => purchases.some((p) => p.request_id === id && (p.status === 'approved' || p.status === 'pending'));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const list = targets.split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (await onCreate(title, barrier, list, priority)) {
      setTitle('');
      setBarrier('');
      setTargets('');
      setPriority(2);
    }
  }

  return (
    <section className="card">
      <h2>Запросы к HQ вне каталога</h2>
      <p className="muted small">
        До {settings.max_hq_requests} запросов на команду. Организаторы оценивают каждый (обычно 7–10 монет), после этого
        его можно купить в разделе «Покупки».
      </p>

      {requests.length > 0 && (
        <ul className="list">
          {requests.map((r) => (
            <li key={r.id} className="request">
              <div>
                <strong>{r.title}</strong> <span className="tag">{PRIORITY_LABEL[r.priority]}</span>
                {r.barrier && <div className="small">{r.barrier}</div>}
                <div className="muted small">
                  Клиенты: {r.targets.join(', ') || '—'} · Цена: {r.price === null ? 'не оценён' : `${r.price} мон.`}
                  {bought(r.id) && ' · куплен'}
                </div>
              </div>
              <div className="row">
                {staff && !bought(r.id) && (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      className="narrow-input"
                      aria-label="Цена в монетах"
                      value={prices[r.id] ?? (r.price ?? '')}
                      onChange={(e) => setPrices((p) => ({ ...p, [r.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="chip"
                      disabled={busy}
                      onClick={() => {
                        const v = prices[r.id] ?? String(r.price ?? '');
                        onPrice(r.id, v === '' ? null : Number(v));
                      }}
                    >
                      Сохранить цену
                    </button>
                  </>
                )}
                {(staff || canCreate) && !bought(r.id) && (
                  <button
                    type="button"
                    className="chip"
                    disabled={busy}
                    onClick={() => window.confirm(`Удалить запрос «${r.title}»?`) && onDelete(r.id)}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {requests.length === 0 && <p className="muted">Запросов нет.</p>}

      {canCreate && requests.length < settings.max_hq_requests && (
        <form className="purchase-form" onSubmit={(e) => void submit(e)}>
          <label>
            Что нужно от HQ
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </label>
          <label>
            Какой барьер снимает и как применим
            <textarea value={barrier} onChange={(e) => setBarrier(e.target.value)} maxLength={1000} rows={2} />
          </label>
          <div className="row">
            <label>
              Клиенты (коды через запятую)
              <input value={targets} onChange={(e) => setTargets(e.target.value)} placeholder="G1, B3" />
            </label>
            <label>
              Приоритет
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={1}>Высокий</option>
                <option value={2}>Средний</option>
                <option value={3}>Низкий</option>
              </select>
            </label>
          </div>
          <button type="submit" disabled={busy || !title.trim()}>
            Добавить запрос
          </button>
        </form>
      )}
    </section>
  );
}
