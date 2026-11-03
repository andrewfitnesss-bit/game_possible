import { Lock, Sparkles, X } from 'lucide-react';
import { useT, type T } from '../../i18n/prefs';
import { verticalStyle } from '../../lib/verticals';
import type { Client, ClientHint, Placement } from '../../lib/types';
import { Modal, closeDialog } from '../../ui/Modal';

interface Props {
  client: Client;
  hints: ClientHint[];
  placement: Placement | undefined;
  staff: boolean;
  onClose: () => void;
}

export function placementText(p: Placement | undefined, t: T): string {
  if (!p) return t('placement.none');
  if (p.bucket === 'midmarket') return t('placement.mm');
  const bucket = p.bucket === 'active' ? t('board.active') : t('board.maintenance');
  return t('placement.kam', { kam: p.kam ?? '', bucket }) + (p.ssm ? t('placement.ssm', { n: p.ssm }) : '');
}

export function ClientDialog({ client, hints, placement, staff, onClose }: Props) {
  const t = useT();
  const hint = (level: 1 | 2) => hints.find((h) => h.client_code === client.code && h.level === level);

  return (
    <Modal
      width={660}
      onClose={onClose}
      header={
        <div className="client-hero" style={verticalStyle(client.code)}>
          <div className="hero-content">
            <div className="row between top">
              <span className="code-badge" style={verticalStyle(client.code)}>
                {client.code}
              </span>
              <button type="button" className="btn btn-ghost btn-icon btn-sm hero-close" onClick={(e) => closeDialog(e.currentTarget)} aria-label={t('common.close')}>
                <X size={18} />
              </button>
            </div>
            <h2>{client.name}</h2>
            <div className="row hero-tags">
              <span className="badge badge-gold">{client.industry}</span>
              <span className="badge badge-glass">{placementText(placement, t)}</span>
            </div>
          </div>
        </div>
      }
    >
      <p className="text-2 dialog-lead">{client.business}</p>
      <dl className="facts">
        <div className="fact">
          <dt>{t('client.employees')}</dt>
          <dd>{client.employees}</dd>
        </div>
        <div className="fact">
          <dt>{t('client.kl')}</dt>
          <dd>{client.kl_related}</dd>
        </div>
        {client.extra && (
          <div className="fact">
            <dt>{t('client.extra')}</dt>
            <dd>{client.extra}</dd>
          </div>
        )}
      </dl>

      {([1, 2] as const).map((level) => {
        const h = hint(level);
        return h ? (
          <section key={level} className="hint-card open">
            <span className="section-title">
              <Sparkles size={14} /> Hint {level}
            </span>
            <p>{h.body}</p>
          </section>
        ) : (
          <section key={level} className="hint-card locked">
            <span className="section-title">
              <Lock size={14} /> Hint {level}
            </span>
            <span className="small">{staff ? t('client.hintMissing') : level === 2 ? t('client.hint2Locked') : t('client.hintLocked')}</span>
          </section>
        );
      })}
    </Modal>
  );
}
