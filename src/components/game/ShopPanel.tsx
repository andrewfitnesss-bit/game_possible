import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Building, Coins, Eye, GraduationCap, Lock, Megaphone, MessageSquareQuote, ShoppingCart, Sparkles } from 'lucide-react';
import { useT, type TKey } from '../../i18n/prefs';
import { categoryCap, hasApproved, PURCHASE_PHASES, type Spend } from '../../lib/game';
import { CATEGORY_COLOR, verticalStyle } from '../../lib/verticals';
import type { Category, Client, GameSettings, Phase } from '../../lib/types';
import type { TeamData } from '../../lib/useTeamData';
import { useConfirm } from '../../ui/Confirm';
import { Stat, Tabs } from '../../ui/kit';
import type { WorkspaceActions } from './actions';
import { PurchaseDialog, type ShopOption } from './PurchaseDialog';
import { PurchaseHistory } from './PurchaseHistory';

interface Props {
  data: TeamData;
  settings: GameSettings;
  spend: Spend;
  phase: Phase;
  staff: boolean;
  captain: boolean;
  busy: boolean;
  actions: WorkspaceActions;
  canBuyHints: boolean;
  onBuyHint: (item: 'HINT1' | 'HINT2', c: Client) => Promise<boolean>;
  onOpenClient: (c: Client) => void;
}

type Section = Category | 'history';
const CATEGORY_ICON = { info: Sparkles, marketing: Megaphone, hq: Building } as const;
const TITLE: Record<Category, TKey> = { info: 'shop.infoTitle', marketing: 'shop.marketingTitle', hq: 'shop.hqTitle' };

function defaultSection(phase: Phase): Section {
  if (PURCHASE_PHASES.marketing.includes(phase)) return 'marketing';
  if (PURCHASE_PHASES.hq.includes(phase)) return 'hq';
  return 'info';
}

export function ShopPanel({ data, settings, spend, phase, staff, captain, busy, actions, canBuyHints, onBuyHint, onOpenClient }: Props) {
  const t = useT();
  const ask = useConfirm();
  const { catalog, secrets, clients, purchases, hqRequests } = data;
  const inGame = useMemo(() => clients.filter((c) => c.in_game), [clients]);
  const [selected, setSelected] = useState<ShopOption | null>(null);
  const [view, setView] = useState<Section>(() => defaultSection(phase));

  const canBuy = (c: Category) => staff || (captain && PURCHASE_PHASES[c].includes(phase));
  const secretOf = (code: string) => secrets.find((s) => s.code === code)?.note;
  const owned = (item: string) => purchases.filter((p) => p.item === item && p.status === 'approved').length;
  const consultNote = hasApproved(purchases, 'CONSULT') ? secretOf('CONSULT') : undefined;

  const options = useMemo<ShopOption[]>(
    () => [
      ...catalog
        .filter((i) => i.category !== 'info')
        .map((i) => ({
          key: i.code,
          item: i.code,
          requestId: null,
          category: i.category,
          code: i.code,
          name: i.name,
          cost: i.cost,
          maxTargets: i.max_targets,
          leads: i.leads,
          description: i.description,
          secret: secrets.find((s) => s.code === i.code)?.note,
          fixedTargets: [],
        })),
      ...hqRequests
        .filter((r) => r.price !== null)
        .map((r) => ({
          key: `REQ-${r.id}`,
          item: 'REQ',
          requestId: r.id,
          category: 'hq' as const,
          code: 'REQ',
          name: r.title,
          cost: r.price ?? 0,
          maxTargets: 0,
          leads: 0,
          description: r.barrier,
          fixedTargets: r.targets,
        })),
    ],
    [catalog, hqRequests, secrets],
  );

  // Консультация покупается в одно действие с подтверждением необратимости.
  async function buyConsult() {
    const ok = await ask({ title: t('shop.buyConsultTitle'), message: t('shop.buyConsultText'), confirmLabel: t('shop.buyFor', { n: 1 }) });
    if (ok !== null) void actions.createPurchase('CONSULT', [], '', null);
  }

  function lockNote(c: Category): ReactNode {
    if (canBuy(c)) return null;
    if (!captain && !staff) return <span className="badge">{t('shop.captainBuys')}</span>;
    return (
      <span className="badge">
        <Lock /> {t('shop.opensIn', { phase: t(`phaseShort.${PURCHASE_PHASES[c][0]}` as TKey) })}
      </span>
    );
  }

  const sectionHead = (c: Category) => {
    const Icon = CATEGORY_ICON[c];
    return (
      <div className="card-head">
        <div className="card-title">
          <Icon size={20} />
          <div>
            <h2>{t(TITLE[c])}</h2>
            <div className="card-sub">{t('shop.remaining', { left: categoryCap(settings, c) - spend.byCategory[c], cap: categoryCap(settings, c) })}</div>
          </div>
        </div>
        {lockNote(c)}
      </div>
    );
  };

  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat label={t('ws.statBudget')} icon={<Coins />} value={spend.total} max={settings.budget} />
        {(['info', 'marketing', 'hq'] as const).map((c) => {
          const Icon = CATEGORY_ICON[c];
          return <Stat key={c} label={t(`cat.${c}` as TKey)} icon={<Icon />} value={spend.byCategory[c]} max={categoryCap(settings, c)} />;
        })}
        <Stat label={t('cat.spec')} icon={<GraduationCap />} value={spend.specs} max={settings.cost_spec * settings.max_specs} />
      </div>

      {consultNote && (
        <details className="callout callout-ember consult">
          <summary>
            <MessageSquareQuote size={20} />
            <strong className="grow">{t('shop.consultMsg')}</strong>
            <span className="xsmall consult-toggle">{t('shop.show')}</span>
          </summary>
          <p className="small">{consultNote}</p>
        </details>
      )}

      <Tabs
        pills
        label={t('shop.sections')}
        value={view}
        onChange={setView}
        tabs={[
          { id: 'info', label: t('shop.tabHints'), icon: <Sparkles size={16} /> },
          { id: 'marketing', label: t('shop.tabMarketing'), icon: <Megaphone size={16} /> },
          { id: 'hq', label: t('shop.tabHq'), icon: <Building size={16} /> },
          { id: 'history', label: t('shop.tabHistory'), icon: <ShoppingCart size={16} />, count: purchases.filter((p) => p.status === 'approved').length },
        ]}
      />

      {view === 'info' && (
        <section className="card">
          {sectionHead('info')}
          <div className="hints-grid">
            {inGame.map((c) => {
              const h1 = hasApproved(purchases, 'HINT1', c.code);
              const h2 = hasApproved(purchases, 'HINT2', c.code);
              const next = !h1 ? 'HINT1' : !h2 ? 'HINT2' : null;
              return (
                <div key={c.code} className="hint-row">
                  <span className="code-badge" style={verticalStyle(c.code)}>
                    {c.code}
                  </span>
                  <button type="button" className="grow chip-main" onClick={() => onOpenClient(c)} title={t('board.openCard')}>
                    <span className="name">{c.name}</span>
                    <span className="chip-sub">{c.industry}</span>
                  </button>
                  <span className="hint-state">
                    {h1 && <span className="pip">H1</span>}
                    {h2 && <span className="pip">H2</span>}
                    {next && canBuyHints ? (
                      <BuyHintButton hint={next} busy={busy} onClick={() => void onBuyHint(next, c)} />
                    ) : !next ? (
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => onOpenClient(c)} aria-label={t('board.openCard')}>
                        <Eye size={14} />
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
          {staff && (
            <div className="callout callout-ember">
              <MessageSquareQuote size={20} />
              <div className="grow stack">
                <strong>{t('shop.consultTitle')}</strong>
                <span className="small">{t('shop.consultText')}</span>
              </div>
              {hasApproved(purchases, 'CONSULT') ? (
                <span className="badge badge-success">{t('shop.sold')}</span>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void buyConsult()}>
                  {t('shop.buy')}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {(['marketing', 'hq'] as const)
        .filter((c) => c === view)
        .map((c) => (
          <section key={c} className="card">
            {sectionHead(c)}
            <div className="catalog-grid">
              {options
                .filter((o) => o.category === c)
                .map((o) => {
                  const count = o.item === 'REQ' ? purchases.filter((p) => p.request_id === o.requestId && p.status === 'approved').length : owned(o.item);
                  const available = canBuy(c) && !(o.item === 'REQ' && count > 0);
                  return (
                    <article key={o.key} className={canBuy(c) ? 'item-card' : 'item-card locked'}>
                      {count > 0 && <span className="item-owned badge badge-success">{count > 1 ? t('shop.boughtTimes', { n: count }) : t('shop.bought')}</span>}
                      <div className="item-top">
                        <span className="item-code" style={{ '--cat': CATEGORY_COLOR[c] } as CSSProperties}>
                          {o.item === 'REQ' ? t('shop.request') : o.code}
                        </span>
                        <span className="coin">{o.cost}</span>
                      </div>
                      <div className="item-name">{o.name}</div>
                      {o.description && <div className="item-desc">{o.description}</div>}
                      {staff && o.secret && <div className="item-secret">{o.secret}</div>}
                      <div className="item-foot">
                        <span className="muted xsmall">
                          {o.maxTargets ? t('shop.upTo', { n: o.maxTargets }) : o.fixedTargets.length ? o.fixedTargets.join(', ') : t('shop.noTargets')}
                          {o.leads ? ` · ${t('shop.leads', { n: o.leads })}` : ''}
                        </span>
                        {available && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setSelected(o)}>
                            {t('shop.buy')}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        ))}

      {view === 'history' && (
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <ShoppingCart size={20} />
              <h2>{t('shop.historyTitle')}</h2>
            </div>
            <span className="muted small">{t('shop.spent', { n: spend.total })}</span>
          </div>
          <PurchaseHistory purchases={purchases} catalog={catalog} requests={hqRequests} staff={staff} busy={busy} actions={actions} />
        </section>
      )}

      {selected && (
        <PurchaseDialog
          option={selected}
          clients={inGame}
          spend={spend}
          settings={settings}
          staff={staff}
          busy={busy}
          onClose={() => setSelected(null)}
          onSubmit={(targets, justification) =>
            actions.createPurchase(selected.item, selected.item === 'REQ' ? selected.fixedTargets : targets, justification, selected.requestId)
          }
        />
      )}
    </div>
  );
}

/** Кнопка покупки подсказки: что покупаем и сколько стоит. */
export function BuyHintButton({ hint, busy, onClick, large }: { hint: 'HINT1' | 'HINT2'; busy: boolean; onClick: () => void; large?: boolean }) {
  const t = useT();
  const name = hint === 'HINT1' ? 'Hint 1' : 'Hint 2';
  return (
    <button
      type="button"
      className={large ? 'btn btn-primary btn-sm buy-hint' : 'btn btn-secondary btn-xs buy-hint'}
      disabled={busy}
      onClick={onClick}
      title={t('shop.buyHintTitleAttr', { hint: name })}
    >
      {t('shop.buyHintBtn', { hint: name })}
      <span className="coin">1</span>
    </button>
  );
}
