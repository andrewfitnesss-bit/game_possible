import { Building, Megaphone, Sparkles, Undo2 } from 'lucide-react';
import { useT, type T, type TKey } from '../../i18n/prefs';
import { verticalStyle } from '../../lib/verticals';
import type { CatalogItem, HqRequest, Purchase } from '../../lib/types';
import { useConfirm } from '../../ui/Confirm';
import { Empty } from '../../ui/kit';
import type { WorkspaceActions } from './actions';

const CATEGORY_ICON = { info: Sparkles, marketing: Megaphone, hq: Building } as const;
const STATUS_BADGE = {
  pending: 'badge',
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
}

export function itemTitle(p: Purchase, catalog: CatalogItem[], requests: HqRequest[], t: T): string {
  if (p.item === 'REQ') return t('history.request', { title: requests.find((r) => r.id === p.request_id)?.title ?? `#${p.request_id}` });
  const item = catalog.find((i) => i.code === p.item);
  if (!item) return p.item;
  return item.category === 'info' ? item.name : `${item.code} · ${item.name}`;
}

export function PurchaseHistory({ purchases, catalog, requests, staff, busy, actions }: Props) {
  const t = useT();
  const ask = useConfirm();

  if (purchases.length === 0) return <Empty title={t('shop.noPurchases')} />;

  async function cancel(p: Purchase) {
    const note = await ask({
      title: t('history.cancelTitle'),
      message: t('history.cancelText', { item: itemTitle(p, catalog, requests, t) }),
      input: { label: t('history.cancelReason'), placeholder: t('history.cancelPh'), required: true },
      confirmLabel: t('history.cancel'),
      danger: true,
    });
    if (note !== null) void actions.cancelPurchase(p.id, note);
  }

  return (
    <div className="pur-list">
      {purchases.map((p) => {
        const Icon = CATEGORY_ICON[p.category];
        const dim = p.status !== 'approved';
        return (
          <article key={p.id} className={dim ? 'pur dim' : 'pur'}>
            <span className="pur-icon">
              <Icon size={18} />
            </span>
            <div>
              <div className="pur-title">{itemTitle(p, catalog, requests, t)}</div>
              {p.justification && <div className="pur-just">{p.justification}</div>}
              {p.targets.length > 0 && (
                <div className="targets-line">
                  {p.targets.map((code) => (
                    <span key={code} className="code-badge" style={verticalStyle(code)}>
                      {code}
                    </span>
                  ))}
                </div>
              )}
              {p.note && <div className="muted xsmall">{t('history.comment', { note: p.note })}</div>}
            </div>
            <div className="pur-side">
              <div className="row">
                <span className="coin">{p.cost}</span>
                <span className={STATUS_BADGE[p.status]}>{t(`status.${p.status}` as TKey)}</span>
              </div>
              {staff && p.status === 'approved' && (
                <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void cancel(p)}>
                  <Undo2 size={14} /> {t('history.cancel')}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
