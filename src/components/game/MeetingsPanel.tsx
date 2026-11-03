import { useState, type FormEvent } from 'react';
import { Handshake, Trash2, Trophy } from 'lucide-react';
import { useT, type TKey } from '../../i18n/prefs';
import { verticalStyle } from '../../lib/verticals';
import type { Client, MeetingOutcome, MeetingResult } from '../../lib/types';
import { useConfirm } from '../../ui/Confirm';
import { Empty, money } from '../../ui/kit';
import type { WorkspaceActions } from './actions';

interface Props {
  clients: Client[];
  meetings: MeetingResult[];
  staff: boolean;
  busy: boolean;
  actions: WorkspaceActions;
}

const OUTCOMES: MeetingOutcome[] = ['no_progress', 'qualified', 'strategic'];
const OUTCOME_BADGE: Record<MeetingOutcome, string> = {
  no_progress: 'badge',
  qualified: 'badge badge-info',
  strategic: 'badge badge-success',
};

export function MeetingsPanel({ clients, meetings, staff, busy, actions }: Props) {
  const t = useT();
  const ask = useConfirm();
  const [client, setClient] = useState('');
  const [outcome, setOutcome] = useState<MeetingOutcome>('qualified');
  const [amount, setAmount] = useState('');
  const [strength, setStrength] = useState('');
  const [improvement, setImprovement] = useState('');

  const byCode = (code: string) => clients.find((c) => c.code === code);
  const total = meetings.reduce((s, m) => s + m.amount, 0);

  function edit(m: MeetingResult) {
    setClient(m.client_code);
    setOutcome(m.outcome);
    setAmount(String(m.amount));
    setStrength(m.strength);
    setImprovement(m.improvement);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await actions.saveMeeting({ client_code: client, outcome, amount: Number(amount) || 0, strength, improvement });
    if (ok) {
      setClient('');
      setAmount('');
      setStrength('');
      setImprovement('');
    }
  }

  async function remove(m: MeetingResult) {
    const res = await ask({ title: t('meet.deleteTitle'), message: `${m.client_code} ${byCode(m.client_code)?.name ?? ''}`, confirmLabel: t('common.delete'), danger: true });
    if (res !== null) void actions.deleteMeeting(m.client_code);
  }

  const list = (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Handshake size={20} />
          <div>
            <h2>{t('meet.title')}</h2>
            <div className="card-sub">{t('meet.sub')}</div>
          </div>
        </div>
        <span className="badge badge-gold">
          <Trophy /> {money(total)}
        </span>
      </div>
      {meetings.length === 0 ? (
        <Empty title={t('meet.empty')}>{staff ? t('meet.emptyStaff') : t('meet.emptyViewer')}</Empty>
      ) : (
        <div className="pur-list">
          {meetings.map((m) => (
            <article key={m.client_code} className="pur">
              <span className="code-badge" style={verticalStyle(m.client_code)}>
                {m.client_code}
              </span>
              <div>
                <div className="row">
                  <span className="pur-title">{byCode(m.client_code)?.name ?? m.client_code}</span>
                  <span className={OUTCOME_BADGE[m.outcome]}>{t(`outcome.${m.outcome}` as TKey)}</span>
                </div>
                {m.strength && <div className="pur-just"><span className="muted">{t('meet.strength')}:</span> {m.strength}</div>}
                {m.improvement && <div className="pur-just"><span className="muted">{t('meet.improvement')}:</span> {m.improvement}</div>}
              </div>
              <div className="pur-side">
                <strong className="num">{money(m.amount)}</strong>
                {staff && (
                  <div className="pur-actions">
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => edit(m)}>
                      {t('common.edit')}
                    </button>
                    <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void remove(m)} aria-label={t('common.delete')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  if (!staff) return list;

  return (
    <div className="grid-2">
      {list}
      <section className="card">
        <h2>{t('meet.formTitle')}</h2>
        <form className="form" onSubmit={(e) => void submit(e)}>
          <label className="field">
            {t('meet.client')}
            <select value={client} onChange={(e) => setClient(e.target.value)} required>
              <option value="">{t('common.choose')}</option>
              {clients
                .filter((c) => c.in_game)
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="field">
            {t('meet.outcome')}
            <div className="segmented three" role="group" aria-label={t('meet.outcome')}>
              {OUTCOMES.map((o) => (
                <button key={o} type="button" aria-pressed={outcome === o} onClick={() => setOutcome(o)}>
                  {t(`outcome.${o}` as TKey)}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            {t('meet.amount')}
            <input type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </label>
          <label className="field">
            {t('meet.strength')}
            <input value={strength} onChange={(e) => setStrength(e.target.value)} maxLength={500} />
          </label>
          <label className="field">
            {t('meet.improvement')}
            <input value={improvement} onChange={(e) => setImprovement(e.target.value)} maxLength={500} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !client}>
            {t('meet.save')}
          </button>
        </form>
      </section>
    </div>
  );
}
