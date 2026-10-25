import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Search, ShieldAlert } from 'lucide-react';
import { CATEGORY_LABEL, categoryCap, type Spend } from '../../lib/game';
import { CATEGORY_COLOR, verticalStyle } from '../../lib/verticals';
import type { Category, Client, GameSettings } from '../../lib/types';
import { Modal, closeDialog } from '../../ui/Modal';

export interface ShopOption {
  key: string;
  item: string;
  requestId: number | null;
  category: Category;
  code: string;
  name: string;
  cost: number;
  maxTargets: number;
  leads: number;
  description: string;
  secret?: string;
  fixedTargets: string[];
}

interface Props {
  option: ShopOption;
  clients: Client[];
  spend: Spend;
  settings: GameSettings;
  staff: boolean;
  busy: boolean;
  onSubmit: (targets: string[], justification: string) => Promise<boolean>;
  onClose: () => void;
}

export function PurchaseDialog({ option, clients, spend, settings, staff, busy, onSubmit, onClose }: Props) {
  const [targets, setTargets] = useState<string[]>(option.fixedTargets);
  const [justification, setJustification] = useState('');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clients.filter((c) => `${c.code} ${c.name} ${c.industry}`.toLowerCase().includes(q)) : clients;
  }, [clients, query]);

  const catLeft = categoryCap(settings, option.category) - spend.byCategory[option.category];
  const totalLeft = settings.budget - spend.total;
  const over = option.cost > catLeft || option.cost > totalLeft;
  const needsJustification = option.category !== 'info';

  function toggle(code: string) {
    setTargets((t) => (t.includes(code) ? t.filter((x) => x !== code) : [...t, code]));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (await onSubmit(targets, justification)) closeDialog(form);
  }

  return (
    <Modal
      width={720}
      onClose={onClose}
      title={
        <span className="row">
          <span className="item-code" style={{ '--cat': CATEGORY_COLOR[option.category] } as CSSProperties}>
            {option.code}
          </span>
          {option.name}
        </span>
      }
      subtitle={`${CATEGORY_LABEL[option.category]} · ${option.cost} мон.${option.maxTargets ? ` · до ${option.maxTargets} клиентов` : ''}${option.leads ? ` · ${option.leads} будущих лидов` : ''}`}
    >
      <form className="form" onSubmit={(e) => void submit(e)}>
        {option.description && <p className="text-2">{option.description}</p>}
        {staff && option.secret && (
          <div className="callout callout-secret">
            <ShieldAlert size={18} />
            <div>
              <strong>Только для куратора.</strong> {option.secret}
            </div>
          </div>
        )}

        {option.maxTargets > 0 && (
          <div className="stack">
            <div className="row between">
              <span className="section-title">
                Целевые клиенты · {targets.length}/{option.maxTargets}
              </span>
              {clients.length > 10 && (
                <label className="row search">
                  <Search size={16} className="muted" />
                  <input className="input select-sm" placeholder="Поиск клиента" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск клиента" />
                </label>
              )}
            </div>
            <div className="target-grid">
              {visible.map((c) => {
                const on = targets.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    className="target"
                    aria-pressed={on}
                    disabled={!on && targets.length >= option.maxTargets}
                    onClick={() => toggle(c.code)}
                    title={c.name}
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
        )}

        {option.fixedTargets.length > 0 && option.maxTargets === 0 && (
          <div className="targets-line">
            {option.fixedTargets.map((t) => (
              <span key={t} className="code-badge" style={verticalStyle(t)}>
                {t}
              </span>
            ))}
          </div>
        )}

        {needsJustification && (
          <label className="field">
            Обоснование
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Какой барьер клиента снимаем и какой эффект ждём"
              maxLength={1000}
              rows={3}
              required
            />
          </label>
        )}

        <div className="summary-line">
          <span>
            Спишется <span className="coin">{option.cost}</span>
          </span>
          <span className={over ? 'strong text-danger' : 'muted'}>
            {CATEGORY_LABEL[option.category]}: останется {catLeft - option.cost} · всего останется {totalLeft - option.cost}
          </span>
        </div>

        <div className="row end">
          <button type="button" className="btn btn-secondary" onClick={(e) => closeDialog(e.currentTarget)}>
            Отмена
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || over || (option.maxTargets > 0 && targets.length === 0) || (needsJustification && justification.trim().length < 3)}
          >
            {staff ? 'Провести покупку' : 'Отправить заявку куратору'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
