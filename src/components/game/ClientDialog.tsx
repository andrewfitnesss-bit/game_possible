import { useEffect, useRef } from 'react';
import type { Client, ClientHint } from '../../lib/types';

interface Props {
  client: Client;
  hints: ClientHint[];
  staff: boolean;
  onClose: () => void;
}

export function ClientDialog({ client, hints, staff, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const own = hints.filter((h) => h.client_code === client.code).sort((a, b) => a.level - b.level);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="dialog-body">
        <div className="row between">
          <h2>
            {client.code} {client.name}
          </h2>
          <button type="button" className="icon" onClick={() => ref.current?.close()} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <table className="profile">
          <tbody>
            <tr>
              <th>Industry</th>
              <td>{client.industry}</td>
            </tr>
            <tr>
              <th>Business</th>
              <td>{client.business}</td>
            </tr>
            <tr>
              <th>Employees</th>
              <td>{client.employees}</td>
            </tr>
            <tr>
              <th>KL Related</th>
              <td>{client.kl_related}</td>
            </tr>
            {client.extra && (
              <tr>
                <th>Extra</th>
                <td>{client.extra}</td>
              </tr>
            )}
          </tbody>
        </table>
        {own.length === 0 && (
          <p className="muted">{staff ? 'Подсказок нет.' : 'Подсказки не куплены. Их продаёт куратор стола.'}</p>
        )}
        {own.map((h) => (
          <section key={h.level} className="hint">
            <h3>Hint {h.level}</h3>
            <p>{h.body}</p>
          </section>
        ))}
      </div>
    </dialog>
  );
}
