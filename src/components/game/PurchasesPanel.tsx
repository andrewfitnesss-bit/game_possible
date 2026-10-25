import { useMemo, useState, type FormEvent } from 'react';
import {
  CATEGORY_LABEL,
  categoryCap,
  hasApproved,
  PURCHASE_PHASES,
  spendOf,
  STATUS_LABEL,
} from '../../lib/game';
import type { CatalogItem, Category, GameSettings, Phase } from '../../lib/types';
import type { TeamData } from '../../lib/useTeamData';
import { Meter } from './TeamBoard';

interface Props {
  data: TeamData;
  settings: GameSettings;
  phase: Phase;
  staff: boolean;
  captain: boolean;
  busy: boolean;
  onCreate: (item: string, targets: string[], justification: string, requestId: number | null) => Promise<boolean>;
  onDecide: (id: number, approve: boolean, note: string) => void;
  onCancel: (id: number, note: string) => void;
}

const CATEGORIES: Category[] = ['info', 'marketing', 'hq'];

// Позиция формы: элемент каталога или оценённый запрос к HQ.
interface Option {
  key: string;
  item: string;
  requestId: number | null;
  category: Category;
  name: string;
  cost: number;
  maxTargets: number;
  description: string;
  defaultTargets: string[];
}

export function PurchasesPanel({ data, settings, phase, staff, captain, busy, onCreate, onDecide, onCancel }: Props) {
  const { catalog, secrets, clients, purchases, hqRequests } = data;
  const spend = spendOf(purchases);
  const inGame = clients.filter((c) => c.in_game);

  const options = useMemo<Option[]>(() => {
    const fromCatalog = catalog
      // Консультацию предлагает куратор: капитан о ней заранее не знает.
      .filter((i: CatalogItem) => staff || i.code !== 'CONSULT')
      .map((i) => ({
        key: i.code,
        item: i.code,
        requestId: null,
        category: i.category,
        name: i.category === 'info' ? i.name : `${i.code} ${i.name}`,
        cost: i.cost,
        maxTargets: i.max_targets,
        description: i.description,
        defaultTargets: [],
      }));
    const fromRequests = hqRequests
      .filter((r) => r.price !== null)
      .map((r) => ({
        key: `REQ-${r.id}`,
        item: 'REQ',
        requestId: r.id,
        category: 'hq' as const,
        name: `Запрос к HQ: ${r.title}`,
        cost: r.price ?? 0,
        maxTargets: 0,
        description: r.barrier,
        defaultTargets: r.targets,
      }));
    return [...fromCatalog, ...fromRequests].filter((o) => staff || PURCHASE_PHASES[o.category].includes(phase));
  }, [catalog, hqRequests, staff, phase]);

  const [key, setKey] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [justification, setJustification] = useState('');
  const selected = options.find((o) => o.key === key) ?? null;
  const secret = selected ? secrets.find((s) => s.code === selected.item)?.note : undefined;
  const isHint = selected?.item === 'HINT1' || selected?.item === 'HINT2';
  const canBuy = staff || captain;

  const targetChoices = useMemo(() => {
    if (!selected) return [];
    if (selected.item === 'HINT1') return inGame.filter((c) => !hasApproved(purchases, 'HINT1', c.code));
    if (selected.item === 'HINT2')
      return inGame.filter((c) => hasApproved(purchases, 'HINT1', c.code) && !hasApproved(purchases, 'HINT2', c.code));
    return inGame;
  }, [selected, inGame, purchases]);

  function toggleTarget(code: string) {
    setTargets((t) => (t.includes(code) ? t.filter((x) => x !== code) : [...t, code]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const ok = await onCreate(selected.item, selected.item === 'REQ' ? selected.defaultTargets : targets, justification, selected.requestId);
    if (ok) {
      setTargets([]);
      setJustification('');
    }
  }

  const itemName = (item: string, requestId: number | null) =>
    item === 'REQ'
      ? `Запрос к HQ: ${hqRequests.find((r) => r.id === requestId)?.title ?? `#${requestId}`}`
      : (catalog.find((i) => i.code === item)?.name ?? item);

  const consultNote = hasApproved(purchases, 'CONSULT') ? secrets.find((s) => s.code === 'CONSULT')?.note : undefined;

  return (
    <section className="card">
      <h2>Покупки</h2>
      <div className="meters">
        <Meter label="Всего, монет" value={spend.total} max={settings.budget} />
        {CATEGORIES.map((c) => (
          <Meter key={c} label={CATEGORY_LABEL[c]} value={spend.byCategory[c]} max={categoryCap(settings, c)} />
        ))}
      </div>

      {consultNote && (
        <blockquote className="hint">
          <strong>Сообщение от бывшего коллеги.</strong> {consultNote}
        </blockquote>
      )}

      {canBuy && options.length === 0 && <p className="muted">В этом раунде покупок нет.</p>}
      {canBuy && options.length > 0 && (
        <form className="purchase-form" onSubmit={(e) => void submit(e)}>
          <label>
            Позиция
            <select
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setTargets([]);
              }}
              required
            >
              <option value="">— выберите —</option>
              {CATEGORIES.map((c) => {
                const group = options.filter((o) => o.category === c);
                return group.length ? (
                  <optgroup key={c} label={CATEGORY_LABEL[c]}>
                    {group.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.name} — {o.cost} мон.
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>

          {selected && (
            <>
              {selected.description && <p className="muted small">{selected.description}</p>}
              {staff && secret && selected.item !== 'CONSULT' && (
                <p className="secret small">Только для куратора: {secret}</p>
              )}

              {isHint && (
                <label>
                  Клиент
                  <select value={targets[0] ?? ''} onChange={(e) => setTargets(e.target.value ? [e.target.value] : [])} required>
                    <option value="">— выберите —</option>
                    {targetChoices.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {!isHint && selected.maxTargets > 0 && (
                <fieldset className="targets">
                  <legend>
                    Целевые клиенты: {targets.length} из {selected.maxTargets}
                  </legend>
                  {targetChoices.map((c) => (
                    <label key={c.code} className="check">
                      <input
                        type="checkbox"
                        checked={targets.includes(c.code)}
                        disabled={!targets.includes(c.code) && targets.length >= selected.maxTargets}
                        onChange={() => toggleTarget(c.code)}
                      />
                      {c.code} {c.name}
                    </label>
                  ))}
                </fieldset>
              )}

              {selected.item === 'REQ' && selected.defaultTargets.length > 0 && (
                <p className="small">Клиенты: {selected.defaultTargets.join(', ')}</p>
              )}

              {selected.category !== 'info' && (
                <label>
                  Обоснование: какой барьер снимаем и на каких клиентах
                  <textarea
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    required
                  />
                </label>
              )}

              <button type="submit" disabled={busy}>
                {staff ? 'Провести покупку' : 'Отправить заявку куратору'}
              </button>
            </>
          )}
        </form>
      )}

      {purchases.length === 0 ? (
        <p className="muted">Покупок пока нет.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Позиция</th>
                <th>Клиенты</th>
                <th>Монет</th>
                <th>Статус</th>
                {staff && <th />}
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className={p.status === 'approved' || p.status === 'pending' ? '' : 'dim'}>
                  <td>{p.id}</td>
                  <td>
                    {itemName(p.item, p.request_id)}
                    {p.justification && <div className="muted small">{p.justification}</div>}
                  </td>
                  <td>{p.targets.join(', ') || '—'}</td>
                  <td>{p.cost}</td>
                  <td>
                    <span className={`status ${p.status}`}>{STATUS_LABEL[p.status]}</span>
                    {p.note && <div className="muted small">{p.note}</div>}
                  </td>
                  {staff && (
                    <td className="actions">
                      {p.status === 'pending' && (
                        <>
                          <button type="button" className="chip active" disabled={busy} onClick={() => onDecide(p.id, true, '')}>
                            Провести
                          </button>
                          <button
                            type="button"
                            className="chip"
                            disabled={busy}
                            onClick={() => {
                              const note = window.prompt('Причина отказа');
                              if (note !== null) onDecide(p.id, false, note);
                            }}
                          >
                            Отклонить
                          </button>
                        </>
                      )}
                      {p.status === 'approved' && (
                        <button
                          type="button"
                          className="chip"
                          disabled={busy}
                          onClick={() => {
                            const note = window.prompt('Причина отмены (исправление ошибки)');
                            if (note !== null) onCancel(p.id, note);
                          }}
                        >
                          Отменить
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
