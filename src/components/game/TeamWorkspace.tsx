import { useState } from 'react';
import { BOARD_PHASES, HQ_REQUEST_PHASES, settingsOf, SPEC_PHASES } from '../../lib/game';
import { errText } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import type { Client } from '../../lib/types';
import { useTeamData } from '../../lib/useTeamData';
import { CheckpointsPanel } from './CheckpointsPanel';
import { ClientDialog } from './ClientDialog';
import { HqRequestsPanel } from './HqRequestsPanel';
import { MeetingsPanel } from './MeetingsPanel';
import { PhaseBanner } from './PhaseBanner';
import { PurchasesPanel } from './PurchasesPanel';
import { TeamBoard } from './TeamBoard';

export type WorkspaceMode = 'viewer' | 'captain' | 'staff';

export function TeamWorkspace({ teamId, mode }: { teamId: string; mode: WorkspaceMode }) {
  const { data, error: loadError, reload } = useTeamData(teamId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Client | null>(null);

  if (loadError && !data) return <p className="error card" role="alert">{loadError}</p>;
  if (!data) return <p className="center muted">Загрузка стола…</p>;

  const settings = settingsOf(data.game);
  const phase = data.game.phase;
  const staff = mode === 'staff';
  const captain = mode === 'captain';
  const canBoard = staff || (captain && BOARD_PHASES.includes(phase));
  const canSpec = staff || (captain && SPEC_PHASES.includes(phase));
  const canHqRequest = staff || (captain && HQ_REQUEST_PHASES.includes(phase));

  // Вызов RPC: сервер сам проверяет права и лимиты, здесь только показываем ошибку.
  async function call(fn: string, args: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const { error: err } = await supabase.rpc(fn, args);
      if (err) {
        setError(errText(err));
        return false;
      }
      setError(null);
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    } finally {
      setBusy(false);
      void reload();
    }
  }

  const showHq = staff || data.hqRequests.length > 0 || HQ_REQUEST_PHASES.includes(phase);

  return (
    <>
      <PhaseBanner game={data.game} />
      {(error || loadError) && (
        <p className="error card" role="alert">
          {error ?? loadError}
          <button type="button" className="icon" onClick={() => setError(null)} aria-label="Скрыть ошибку">
            ✕
          </button>
        </p>
      )}

      <section className="card">
        <div className="row between">
          <h2>Стол: {data.team.name}</h2>
          <span className="muted small">
            {staff ? 'Режим куратора' : captain ? 'Вы капитан: решения вносите вы' : 'Решения вносит капитан, вам доступен просмотр'}
          </span>
        </div>
        <TeamBoard
          clients={data.clients}
          placements={data.placements}
          kams={data.kams}
          purchases={data.purchases}
          settings={settings}
          canEdit={canBoard}
          canSpec={canSpec}
          onOpen={setOpen}
          onMove={(client, bucket, kam, ssm) =>
            call('set_placement', { p_team: teamId, p_client: client, p_bucket: bucket ?? 'pool', p_kam: kam, p_ssm: ssm })
          }
          onSpec={(kam, spec) => void call('set_kam_spec', { p_team: teamId, p_kam: kam, p_spec: spec })}
        />
      </section>

      <PurchasesPanel
        data={data}
        settings={settings}
        phase={phase}
        staff={staff}
        captain={captain}
        busy={busy}
        onCreate={(item, targets, justification, requestId) =>
          call('create_purchase', {
            p_team: teamId,
            p_item: item,
            p_targets: targets,
            p_justification: justification,
            p_request: requestId,
          })
        }
        onDecide={(id, approve, note) => void call('decide_purchase', { p_id: id, p_approve: approve, p_note: note })}
        onCancel={(id, note) => void call('cancel_purchase', { p_id: id, p_note: note })}
      />

      {showHq && (
        <HqRequestsPanel
          requests={data.hqRequests}
          purchases={data.purchases}
          settings={settings}
          canCreate={canHqRequest}
          staff={staff}
          busy={busy}
          onCreate={(title, barrier, targets, priority) =>
            call('create_hq_request', {
              p_team: teamId,
              p_title: title,
              p_barrier: barrier,
              p_targets: targets,
              p_priority: priority,
            })
          }
          onPrice={(id, price) => void call('price_hq_request', { p_id: id, p_price: price })}
          onDelete={(id) => void call('delete_hq_request', { p_id: id })}
        />
      )}

      <MeetingsPanel
        clients={data.clients}
        meetings={data.meetings}
        staff={staff}
        busy={busy}
        onSave={(r) =>
          call('set_meeting_result', {
            p_team: teamId,
            p_client: r.client_code,
            p_outcome: r.outcome,
            p_amount: r.amount,
            p_strength: r.strength,
            p_improvement: r.improvement,
          })
        }
        onDelete={(client) =>
          void call('set_meeting_result', {
            p_team: teamId,
            p_client: client,
            p_outcome: null,
            p_amount: 0,
            p_strength: '',
            p_improvement: '',
          })
        }
      />

      {(staff || captain) && <CheckpointsPanel data={data} />}

      <section className="card">
        <h2>Состав стола</h2>
        <ul className="list">
          {data.members.map((m) => (
            <li key={m.id}>
              {m.full_name || m.username}
              {m.role === 'captain' && <span className="badge">Капитан</span>}
              {m.role === 'curator' && <span className="badge">Куратор</span>}
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <ClientDialog client={open} hints={data.hints} staff={staff} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
