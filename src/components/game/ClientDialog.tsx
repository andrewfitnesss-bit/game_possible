import { Lock, Sparkles, X } from 'lucide-react';
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

function placementText(p: Placement | undefined): string {
  if (!p) return 'Не распределён';
  if (p.bucket === 'midmarket') return 'MidMarket';
  return `KAM ${p.kam} · ${p.bucket === 'active' ? 'Active' : 'Maintenance'}${p.ssm ? ` · SSM ${p.ssm}` : ''}`;
}

export function ClientDialog({ client, hints, placement, staff, onClose }: Props) {
  const own = hints.filter((h) => h.client_code === client.code);
  const hint = (level: 1 | 2) => own.find((h) => h.level === level);

  return (
    <Modal
      width={660}
      onClose={onClose}
      header={
        <div className="client-hero" style={verticalStyle(client.code)}>
          <div className="row between top">
            <span className="code-badge" style={verticalStyle(client.code)}>
              {client.code}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm hero-close"
              onClick={(e) => closeDialog(e.currentTarget)}
              aria-label="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
          <h2>{client.name}</h2>
          <div className="row hero-tags">
            <span className="badge badge-gold">{client.industry}</span>
            <span className="badge badge-glass">
              {placementText(placement)}
            </span>
          </div>
        </div>
      }
    >
      <p className="text-2 dialog-lead">
        {client.business}
      </p>
      <dl className="facts">
        <div className="fact">
          <dt>Employees</dt>
          <dd>{client.employees}</dd>
        </div>
        <div className="fact">
          <dt>KL Related</dt>
          <dd>{client.kl_related}</dd>
        </div>
        {client.extra && (
          <div className="fact">
            <dt>Extra</dt>
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
            <span className="small">
              {staff ? 'Подсказки нет в справочнике.' : `Не куплено. ${level === 2 ? 'Покупается после Hint 1. ' : ''}Стоимость — 1 монета у куратора стола.`}
            </span>
          </section>
        );
      })}
    </Modal>
  );
}
