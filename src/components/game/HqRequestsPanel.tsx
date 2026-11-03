import { useState, type FormEvent } from 'react';
import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { useT, type TKey } from '../../i18n/prefs';
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

const PRIORITY_CLS = { 1: 'badge badge-danger', 2: 'badge badge-warning', 3: 'badge' } as const;

export function HqRequestsPanel({ requests, purchases, clients, settings, canCreate, staff, busy, actions }: Props) {
  const t = useT();
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
    const ok = await ask({ title: t('hq.deleteTitle'), message: r.title, confirmLabel: t('common.delete'), danger: true });
    if (ok !== null) void actions.deleteHqRequest(r.id);
  }

  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Lightbulb size={20} />
            <div>
              <h2>{t('hq.title')}</h2>
              <div className="card-sub">{t('hq.sub', { n: requests.length, max: settings.max_hq_requests })}</div>
            </div>
          </div>
        </div>
        {requests.length === 0 && <Empty title={t('hq.empty')}>{t('hq.emptyText')}</Empty>}
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
                    <span className={PRIORITY_CLS[r.priority]}>{t(`hq.priority${r.priority}` as TKey)}</span>
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
                  {r.price !== null ? <span className="coin">{r.price}</span> : <span className="badge">{t('hq.notPriced')}</span>}
                  {st && <span className={st === 'approved' ? 'badge badge-success' : 'badge badge-warning'}>{t('hq.bought')}</span>}
                  {!st && (
                    <div className="pur-actions">
                      {staff && (
                        <>
                          <input
                            type="number"
                            min={0}
                            max={25}
                            className="input select-sm price-input"
                            aria-label={t('hq.priceAria')}
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
                            {t('hq.price')}
                          </button>
                        </>
                      )}
                      {(staff || canCreate) && (
                        <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void remove(r)} aria-label={t('hq.deleteTitle')}>
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
          <h2>{t('hq.newTitle')}</h2>
        </div>
        {!canCreate ? (
          <Empty title={t('hq.closedTitle')}>{t('hq.closedText')}</Empty>
        ) : !canAdd ? (
          <Empty title={t('hq.limitTitle')}>{t('hq.limitText')}</Empty>
        ) : (
          <form className="form" onSubmit={(e) => void submit(e)}>
            <label className="field">
              {t('hq.what')}
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder={t('hq.whatPh')} />
            </label>
            <label className="field">
              {t('hq.barrier')}
              <textarea value={barrier} onChange={(e) => setBarrier(e.target.value)} maxLength={1000} rows={3} placeholder={t('hq.barrierPh')} />
            </label>
            <div className="field">
              {t('hq.clients')}
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
              {t('hq.priority')}
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={1}>{t('hq.priority1')}</option>
                <option value={2}>{t('hq.priority2')}</option>
                <option value={3}>{t('hq.priority3')}</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
              <Plus size={16} /> {t('hq.add')}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
