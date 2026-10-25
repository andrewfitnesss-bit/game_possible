import { Building, Check, Megaphone, Sparkles, Undo2, X } from 'lucide-react';
import { STATUS_LABEL } from '../../lib/game';
import { verticalStyle } from '../../lib/verticals';
import type { CatalogItem, HqRequest, Purchase } from '../../lib/types';
import { useConfirm } from '../../ui/Confirm';
import { Empty } from '../../ui/kit';
import type { WorkspaceActions } from './actions';

const CATEGORY_ICON = { info: Sparkles, marketing: Megaphone, hq: Building } as const;
const STATUS_BADGE = {
  pending: 'badge badge-warning',
  approved: 'badge badge-success',
  rejected: 'badge badge-danger',
  cancelled: 'badge badge-danger',
} as const;

interface Props {
  purchases: Purchase[];
  catalog: CatalogItem[];
  requests: HqRequest[];
  staff: boolean;
  busy: boolean;
  actions: WorkspaceActions;
  emptyText?: string;
}

export function itemTitle(p: Purchase, catalog: CatalogItem[], requests: HqRequest[]): string {
  if (p.item === 'REQ') return `Запрос к HQ: ${requests.find((r) => r.id === p.request_id)?.title ?? `#${p.request_id}`}`;
  const item = catalog.find((i) => i.code === p.item);
  if (!item) return p.item;
  return item.category === 'info' ? item.name : `${item.code} · ${item.name}`;
}

export function PurchaseHistory({ purchases, catalog, requests, staff, busy, actions, emptyText }: Props) {
  const ask = useConfirm();

  if (purchases.length === 0) return <Empty title={emptyText ?? 'Покупок пока нет'} />;

  async function reject(p: Purchase) {
    const note = await ask({
      title: 'Отклонить заявку?',
      message: itemTitle(p, catalog, requests),
      input: { label: 'Причина', placeholder: 'Например: не подходит к выбранным клиентам' },
      confirmLabel: 'Отклонить',
      danger: true,
    });
    if (note !== null) void actions.decidePurchase(p.id, false, note);
  }

  async function cancel(p: Purchase) {
    const note = await ask({
      title: 'Отменить покупку?',
      message: `${itemTitle(p, catalog, requests)} — монеты вернутся в бюджет команды.`,
      input: { label: 'Причина (попадёт в аудит)', placeholder: 'Ошибка регистрации', required: true },
      confirmLabel: 'Отменить покупку',
      danger: true,
    });
    if (note !== null) void actions.cancelPurchase(p.id, note);
  }

  return (
    <div className="pur-list">
      {purchases.map((p) => {
        const Icon = CATEGORY_ICON[p.category];
        const dim = p.status === 'rejected' || p.status === 'cancelled';
        return (
          <article key={p.id} className={`pur${p.status === 'pending' ? ' pending' : ''}${dim ? ' dim' : ''}`}>
            <span className="pur-icon">
              <Icon size={18} />
            </span>
            <div>
              <div className="pur-title">{itemTitle(p, catalog, requests)}</div>
              {p.justification && <div className="pur-just">{p.justification}</div>}
              {p.targets.length > 0 && (
                <div className="targets-line">
                  {p.targets.map((t) => (
                    <span key={t} className="code-badge" style={verticalStyle(t)}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {p.note && <div className="muted xsmall">Комментарий: {p.note}</div>}
            </div>
            <div className="pur-side">
              <div className="row">
                <span className="coin">{p.cost}</span>
                <span className={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</span>
              </div>
              {staff && (
                <div className="pur-actions">
                  {p.status === 'pending' && (
                    <>
                      <button type="button" className="btn btn-success btn-xs" disabled={busy} onClick={() => void actions.decidePurchase(p.id, true, '')}>
                        <Check size={14} /> Провести
                      </button>
                      <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => void reject(p)}>
                        <X size={14} /> Отклонить
                      </button>
                    </>
                  )}
                  {p.status === 'approved' && (
                    <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void cancel(p)}>
                      <Undo2 size={14} /> Отменить
                    </button>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
