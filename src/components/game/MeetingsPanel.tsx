import { useState, type FormEvent } from 'react';
import { OUTCOME_LABEL } from '../../lib/game';
import type { Client, MeetingOutcome, MeetingResult } from '../../lib/types';

interface Props {
  clients: Client[];
  meetings: MeetingResult[];
  staff: boolean;
  busy: boolean;
  onSave: (r: Omit<MeetingResult, 'team_id'>) => Promise<boolean>;
  onDelete: (client: string) => void;
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export function MeetingsPanel({ clients, meetings, staff, busy, onSave, onDelete }: Props) {
  const [client, setClient] = useState('');
  const [outcome, setOutcome] = useState<MeetingOutcome>('qualified');
  const [amount, setAmount] = useState('');
  const [strength, setStrength] = useState('');
  const [improvement, setImprovement] = useState('');

  if (!staff && meetings.length === 0) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await onSave({
      client_code: client,
      outcome,
      amount: Number(amount) || 0,
      strength,
      improvement,
    });
    if (ok) {
      setClient('');
      setAmount('');
      setStrength('');
      setImprovement('');
    }
  }

  const name = (code: string) => clients.find((c) => c.code === code)?.name ?? '';
  const total = meetings.reduce((s, m) => s + m.amount, 0);

  return (
    <section className="card">
      <h2>Round 3 — встречи с клиентом</h2>
      {meetings.length > 0 && (
        <ul className="list">
          {meetings.map((m) => (
            <li key={m.client_code} className="request">
              <div>
                <strong>
                  {m.client_code} {name(m.client_code)}
                </strong>{' '}
                <span className="tag accent">{OUTCOME_LABEL[m.outcome]}</span> {money(m.amount)}
                {m.strength && <div className="small">Сильная сторона: {m.strength}</div>}
                {m.improvement && <div className="small">Что улучшить: {m.improvement}</div>}
              </div>
              {staff && (
                <button type="button" className="chip" disabled={busy} onClick={() => onDelete(m.client_code)}>
                  Удалить
                </button>
              )}
            </li>
          ))}
          <li className="muted">Итого в копилку: {money(total)}</li>
        </ul>
      )}

      {staff && (
        <form className="purchase-form" onSubmit={(e) => void submit(e)}>
          <div className="row">
            <label>
              Клиент
              <select value={client} onChange={(e) => setClient(e.target.value)} required>
                <option value="">— выберите —</option>
                {clients
                  .filter((c) => c.in_game)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Результат
              <select value={outcome} onChange={(e) => setOutcome(e.target.value as MeetingOutcome)}>
                {(Object.keys(OUTCOME_LABEL) as MeetingOutcome[]).map((o) => (
                  <option key={o} value={o}>
                    {OUTCOME_LABEL[o]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Сумма, $
              <input type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </div>
          <label>
            Сильная сторона
            <input value={strength} onChange={(e) => setStrength(e.target.value)} maxLength={500} />
          </label>
          <label>
            Что улучшить
            <input value={improvement} onChange={(e) => setImprovement(e.target.value)} maxLength={500} />
          </label>
          <button type="submit" disabled={busy || !client}>
            Сохранить результат
          </button>
        </form>
      )}
    </section>
  );
}
