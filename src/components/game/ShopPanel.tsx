import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Building, Coins, Lock, Megaphone, MessageSquareQuote, ShoppingCart, Sparkles, Eye } from 'lucide-react';
import { CATEGORY_LABEL, categoryCap, hasApproved, PHASES, PURCHASE_PHASES, spendOf } from '../../lib/game';
import { CATEGORY_COLOR, verticalStyle } from '../../lib/verticals';
import type { Category, Client, GameSettings, Phase } from '../../lib/types';
import type { TeamData } from '../../lib/useTeamData';
import { Stat, Tabs } from '../../ui/kit';
import type { WorkspaceActions } from './actions';
import { PurchaseDialog, type ShopOption } from './PurchaseDialog';
import { PurchaseHistory } from './PurchaseHistory';

interface Props {
  data: TeamData;
  settings: GameSettings;
  phase: Phase;
  staff: boolean;
  captain: boolean;
  busy: boolean;
  actions: WorkspaceActions;
  onOpenClient: (c: Client) => void;
}

const CATEGORY_ICON = { info: Sparkles, marketing: Megaphone, hq: Building } as const;

type Section = Category | 'history';

function defaultSection(phase: Phase): Section {
  if (PURCHASE_PHASES.marketing.includes(phase)) return 'marketing';
  if (PURCHASE_PHASES.hq.includes(phase)) return 'hq';
  return 'info';
}

function opensIn(category: Category): string {
  const first = PURCHASE_PHASES[category][0];
  return PHASES.find((p) => p.id === first)?.short ?? first;
}

export function ShopPanel({ data, settings, phase, staff, captain, busy, actions, onOpenClient }: Props) {
  const { catalog, secrets, clients, purchases, hqRequests } = data;
  const spend = spendOf(purchases);
  const inGame = useMemo(() => clients.filter((c) => c.in_game), [clients]);
  const [selected, setSelected] = useState<ShopOption | null>(null);
  const [view, setView] = useState<Section>(() => defaultSection(phase));

  const canBuy = (c: Category) => staff || (captain && PURCHASE_PHASES[c].includes(phase));
  const secretOf = (code: string) => secrets.find((s) => s.code === code)?.note;
  const owned = (item: string) => purchases.filter((p) => p.item === item && p.status === 'approved').length;
  const pending = purchases.filter((p) => p.status === 'pending');
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

  async function buyInfo(item: string, client: string | null) {
    const ok = await actions.createPurchase(item, client ? [client] : [], '', null);
    return ok;
  }

  function lockNote(c: Category): ReactNode {
    if (canBuy(c)) return null;
    if (!captain && !staff) return <span className="badge">Покупает капитан</span>;
    return (
      <span className="badge">
        <Lock /> Откроется в {opensIn(c)}
      </span>
    );
  }

  const section = (c: Category, extra?: ReactNode) => {
    const Icon = CATEGORY_ICON[c];
    const left = categoryCap(settings, c) - spend.byCategory[c];
    return (
      <div className="card-head">
        <div className="card-title">
          <Icon size={20} />
          <div>
            <h2>{c === 'info' ? 'Информация о клиентах' : c === 'marketing' ? 'Local Marketing' : 'HQ Capability'}</h2>
            <div className="card-sub">
              Осталось {left} из {categoryCap(settings, c)} мон. в категории
            </div>
          </div>
        </div>
        <div className="row">
          {extra}
          {lockNote(c)}
        </div>
      </div>
    );
  };

  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat label="Бюджет" icon={<Coins />} value={spend.total} max={settings.budget} />
        {(['info', 'marketing', 'hq'] as const).map((c) => {
          const Icon = CATEGORY_ICON[c];
          return (
            <Stat
              key={c}
              label={CATEGORY_LABEL[c]}
              icon={<Icon />}
              value={spend.byCategory[c]}
              max={categoryCap(settings, c)}
            />
          );
        })}
      </div>

      {consultNote && (
        <details className="callout callout-ember consult">
          <summary>
            <MessageSquareQuote size={20} />
            <strong className="grow">Сообщение от бывшего коллеги</strong>
            <span className="xsmall consult-toggle">показать</span>
          </summary>
          <p className="small">{consultNote}</p>
        </details>
      )}

      {staff && pending.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <ShoppingCart size={20} />
              <h2>Ждут решения</h2>
            </div>
            <span className="badge badge-warning">{pending.length}</span>
          </div>
          <PurchaseHistory
            purchases={pending}
            catalog={catalog}
            requests={hqRequests}
            staff
            busy={busy}
            actions={actions}
          />
        </section>
      )}

      <Tabs
        pills
        label="Разделы магазина"
        value={view}
        onChange={setView}
        tabs={[
          { id: 'info', label: 'Подсказки', icon: <Sparkles size={16} /> },
          { id: 'marketing', label: 'Маркетинг', icon: <Megaphone size={16} /> },
          { id: 'hq', label: 'HQ', icon: <Building size={16} /> },
          { id: 'history', label: 'История', icon: <ShoppingCart size={16} />, count: purchases.length },
        ]}
      />

      {view === 'info' && (
        <section className="card">
          {section('info')}
          <div className="hints-grid">
            {inGame.map((c) => {
              const h1 = hasApproved(purchases, 'HINT1', c.code);
              const h2 = hasApproved(purchases, 'HINT2', c.code);
              const waiting = pending.some(
                (p) => (p.item === 'HINT1' || p.item === 'HINT2') && p.targets.includes(c.code),
              );
              const next = !h1 ? 'HINT1' : !h2 ? 'HINT2' : null;
              return (
                <div key={c.code} className="hint-row">
                  <span className="code-badge" style={verticalStyle(c.code)}>
                    {c.code}
                  </span>
                  <button
                    type="button"
                    className="grow chip-main"
                    onClick={() => onOpenClient(c)}
                    title="Открыть карточку"
                  >
                    <span className="name">{c.name}</span>
                    <span className="chip-sub">{c.industry}</span>
                  </button>
                  <span className="hint-state">
                    {h1 && <span className="pip">H1</span>}
                    {h2 && <span className="pip">H2</span>}
                    {waiting ? (
                      <span className="badge badge-warning">ждёт</span>
                    ) : next && canBuy('info') ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        disabled={busy}
                        onClick={() => void buyInfo(next, c.code)}
                      >
                        {next === 'HINT1' ? 'H1' : 'H2'} · 1
                      </button>
                    ) : !next ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => onOpenClient(c)}
                        aria-label={`Открыть ${c.code}`}
                      >
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
                <strong>Встреча с бывшим коллегой · 1 монета</strong>
                <span className="small">
                  Открывает специализацию Other Enterprise. По сценарию предлагается в R1.3 через пару минут обсуждения.
                </span>
              </div>
              {hasApproved(purchases, 'CONSULT') ? (
                <span className="badge badge-success">Продано</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => void buyInfo('CONSULT', null)}
                >
                  Продать
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
            {section(c)}
            <div className="catalog-grid">
              {options
                .filter((o) => o.category === c)
                .map((o) => {
                  const count =
                    o.item === 'REQ'
                      ? purchases.filter((p) => p.request_id === o.requestId && p.status === 'approved').length
                      : owned(o.item);
                  const available = canBuy(c);
                  return (
                    <article key={o.key} className={available ? 'item-card' : 'item-card locked'}>
                      {count > 0 && (
                        <span className="item-owned badge badge-success">куплено{count > 1 ? ` ×${count}` : ''}</span>
                      )}
                      <div className="item-top">
                        <span className="item-code" style={{ '--cat': CATEGORY_COLOR[c] } as CSSProperties}>
                          {o.item === 'REQ' ? 'Запрос' : o.code}
                        </span>
                        <span className="coin">{o.cost}</span>
                      </div>
                      <div className="item-name">{o.name}</div>
                      {o.description && <div className="item-desc">{o.description}</div>}
                      {staff && o.secret && <div className="item-secret">{o.secret}</div>}
                      <div className="item-foot">
                        <span className="muted xsmall">
                          {o.maxTargets
                            ? `до ${o.maxTargets} клиентов`
                            : o.fixedTargets.length
                              ? o.fixedTargets.join(', ')
                              : 'без целевых клиентов'}
                          {o.leads ? ` · ${o.leads} лидов` : ''}
                        </span>
                        {available && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setSelected(o)}>
                            {staff ? 'Продать' : 'Заказать'}
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
              <h2>История покупок</h2>
            </div>
            <span className="muted small">Проведено на {spend.total} мон.</span>
          </div>
          <PurchaseHistory
            purchases={purchases}
            catalog={catalog}
            requests={hqRequests}
            staff={staff}
            busy={busy}
            actions={actions}
          />
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
            actions.createPurchase(
              selected.item,
              selected.item === 'REQ' ? selected.fixedTargets : targets,
              justification,
              selected.requestId,
            )
          }
        />
      )}
    </div>
  );
}
