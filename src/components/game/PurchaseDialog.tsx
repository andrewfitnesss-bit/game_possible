import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Search, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useT, type TKey } from '../../i18n/prefs';
import { categoryCap, type Spend } from '../../lib/game';
import { CATEGORY_COLOR, verticalStyle } from '../../lib/verticals';
import type { Category, Client, GameSettings, Placement } from '../../lib/types';
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
  placements: Placement[];
  spend: Spend;
  settings: GameSettings;
  staff: boolean;
  busy: boolean;
  onSubmit: (targets: string[], justification: string) => Promise<boolean>;
  onClose: () => void;
}

export function PurchaseDialog({ option, clients, placements, spend, settings, staff, busy, onSubmit, onClose }: Props) {
  const t = useT();
  const [targets, setTargets] = useState<string[]>(option.fixedTargets);
  const [justification, setJustification] = useState('');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clients.filter((c) => `${c.code} ${c.name} ${c.industry}`.toLowerCase().includes(q)) : clients;
  }, [clients, query]);

  const catLabel = t(`cat.${option.category}` as TKey);
  // Клиенты, которых команда не ведёт: отданы в MidMarket или ещё не распределены.
  const bucketOf = (code: string) => placements.find((p) => p.client_code === code)?.bucket ?? null;
  const notOurs = (code: string) => bucketOf(code) !== 'active' && bucketOf(code) !== 'maintenance';
  const offTargets = targets.filter(notOurs);
  const catLeft = categoryCap(settings, option.category) - spend.byCategory[option.category];
  const totalLeft = settings.budget - spend.total;
  const over = option.cost > catLeft || option.cost > totalLeft;
  const needsJustification = option.category !== 'info';

  function toggle(code: string) {
    setTargets((list) => (list.includes(code) ? list.filter((x) => x !== code) : [...list, code]));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (await onSubmit(targets, justification)) closeDialog(form);
  }

  const subtitle = [
    t('shop.subtitle', { cat: catLabel, cost: option.cost }),
    option.maxTargets ? t('shop.upTo', { n: option.maxTargets }) : null,
    option.leads ? t('shop.leads', { n: option.leads }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      width={720}
      onClose={onClose}
      title={
        <span className="row">
          <span className="item-code" style={{ '--cat': CATEGORY_COLOR[option.category] } as CSSProperties}>
            {option.item === 'REQ' ? t('shop.request') : option.code}
          </span>
          {option.name}
        </span>
      }
      subtitle={subtitle}
    >
      <form className="form" onSubmit={(e) => void submit(e)}>
        {option.description && <p className="text-2">{option.description}</p>}
        {staff && option.secret && (
          <div className="callout callout-secret">
            <ShieldAlert size={18} />
            <div>
              <strong>{t('shop.secretStaff')}</strong> {option.secret}
            </div>
          </div>
        )}

        {option.maxTargets > 0 && (
          <div className="stack">
            <div className="row between">
              <span className="section-title">{t('shop.targets', { n: targets.length, max: option.maxTargets })}</span>
              {clients.length > 10 && (
                <label className="row search">
                  <Search size={16} className="muted" />
                  <input className="input select-sm" placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
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
                    <span className="grow target-name">{c.name}</span>
                    {notOurs(c.code) && <span className="target-flag">{bucketOf(c.code) === 'midmarket' ? 'MM' : '—'}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {option.fixedTargets.length > 0 && option.maxTargets === 0 && (
          <div className="targets-line">
            {option.fixedTargets.map((code) => (
              <span key={code} className="code-badge" style={verticalStyle(code)}>
                {code}
              </span>
            ))}
          </div>
        )}

        {needsJustification && (
          <label className="field">
            {t('shop.justification')}
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t('shop.justificationPh')}
              maxLength={1000}
              rows={3}
              required
            />
          </label>
        )}

        {offTargets.length > 0 && (
          <div className="callout callout-warning" role="status">
            <TriangleAlert size={18} />
            <span>{t('shop.offTargets', { list: offTargets.join(', ') })}</span>
          </div>
        )}

        <div className="summary-line">
          <span>
            {t('shop.willSpend')} <span className="coin">{option.cost}</span>
          </span>
          <span className={over ? 'strong text-danger' : 'muted'}>
            {t('shop.remain', { cat: catLabel, a: catLeft - option.cost, b: totalLeft - option.cost })}
          </span>
        </div>
        <div className="callout callout-warning">
          <TriangleAlert size={18} />
          <span>{t('shop.irreversible')}</span>
        </div>

        <div className="row end">
          <button type="button" className="btn btn-secondary" onClick={(e) => closeDialog(e.currentTarget)}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || over || (option.maxTargets > 0 && targets.length === 0) || (needsJustification && justification.trim().length < 3)}
          >
            {t('shop.buyFor', { n: option.cost })}
          </button>
        </div>
      </form>
    </Modal>
  );
}
