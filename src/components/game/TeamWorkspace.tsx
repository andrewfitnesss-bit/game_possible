import { useCallback, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Coins,
  GraduationCap,
  Handshake,
  Headset,
  LayoutGrid,
  Lightbulb,
  ShoppingBag,
  Users,
  Gauge,
} from 'lucide-react';
import { BOARD_PHASES, capacityUsed, HQ_REQUEST_PHASES, PHASES, settingsOf, SPEC_PHASES, spendOf } from '../../lib/game';
import { errText } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import type { Client } from '../../lib/types';
import { useTeamData } from '../../lib/useTeamData';
import { useToast } from '../../ui/Toast';
import { Avatar, Loading, Stat, Tabs, type TabDef } from '../../ui/kit';
import type { WorkspaceActions } from './actions';
import { CheckpointsPanel, teamChecks } from './CheckpointsPanel';
import { ClientDialog } from './ClientDialog';
import { HqRequestsPanel } from './HqRequestsPanel';
import { MeetingsPanel } from './MeetingsPanel';
import { ShopPanel } from './ShopPanel';
import { TeamBoard } from './TeamBoard';

export type WorkspaceMode = 'viewer' | 'captain' | 'staff';
type Tab = 'board' | 'shop' | 'hq' | 'meetings' | 'checks' | 'team';

const TAB_KEY = 'nal-ws-tab';

function readTab(): Tab {
  try {
    const v = sessionStorage.getItem(TAB_KEY);
    if (v && ['board', 'shop', 'hq', 'meetings', 'checks', 'team'].includes(v)) return v as Tab;
  } catch {
    // sessionStorage недоступен (приватный режим) — просто начинаем с доски.
  }
  return 'board';
}

const SUCCESS: Record<string, string> = {
  create_purchase: 'Покупка оформлена',
  decide_purchase: 'Решение по заявке сохранено',
  cancel_purchase: 'Покупка отменена',
  create_hq_request: 'Запрос к HQ добавлен',
  price_hq_request: 'Цена запроса сохранена',
  delete_hq_request: 'Запрос удалён',
  set_meeting_result: 'Результат встречи сохранён',
  set_kam_spec: 'Специализация обновлена',
};

export function TeamWorkspace({ teamId, mode }: { teamId: string; mode: WorkspaceMode }) {
  const { data, error: loadError, reload } = useTeamData(teamId);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [tab, setTabState] = useState<Tab>(readTab);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      // Не критично: вкладка просто не запомнится.
    }
  };

  // Вызов RPC: права и лимиты проверяет сервер, здесь только сообщаем результат.
  const call = useCallback(
    async (fn: string, args: Record<string, unknown>, successText?: string): Promise<boolean> => {
      setBusy(true);
      try {
        const { error } = await supabase.rpc(fn, args);
        if (error) {
          toast.error(errText(error));
          return false;
        }
        const text = successText ?? SUCCESS[fn];
        if (text) toast.success(text);
        return true;
      } catch (e) {
        toast.error(errText(e));
        return false;
      } finally {
        setBusy(false);
        void reload();
      }
    },
    [reload, toast],
  );

  const staff = mode === 'staff';
  const captain = mode === 'captain';

  const actions = useMemo<WorkspaceActions>(
    () => ({
      createPurchase: (item, targets, justification, requestId) =>
        call(
          'create_purchase',
          { p_team: teamId, p_item: item, p_targets: targets, p_justification: justification, p_request: requestId },
          staff ? 'Покупка проведена' : 'Заявка отправлена куратору',
        ),
      decidePurchase: (id, approve, note) =>
        call('decide_purchase', { p_id: id, p_approve: approve, p_note: note }, approve ? 'Покупка проведена' : 'Заявка отклонена'),
      cancelPurchase: (id, note) => call('cancel_purchase', { p_id: id, p_note: note }),
      createHqRequest: (title, barrier, targets, priority) =>
        call('create_hq_request', { p_team: teamId, p_title: title, p_barrier: barrier, p_targets: targets, p_priority: priority }),
      priceHqRequest: (id, price) => call('price_hq_request', { p_id: id, p_price: price }),
      deleteHqRequest: (id) => call('delete_hq_request', { p_id: id }),
      saveMeeting: (r) =>
        call('set_meeting_result', {
          p_team: teamId,
          p_client: r.client_code,
          p_outcome: r.outcome,
          p_amount: r.amount,
          p_strength: r.strength,
          p_improvement: r.improvement,
        }),
      deleteMeeting: (client) =>
        call(
          'set_meeting_result',
          { p_team: teamId, p_client: client, p_outcome: null, p_amount: 0, p_strength: '', p_improvement: '' },
          'Результат встречи удалён',
        ),
    }),
    [call, teamId, staff],
  );

  if (!data) {
    if (loadError) return <div className="callout callout-danger" role="alert">{loadError}</div>;
    return <Loading text="Загрузка стола…" />;
  }

  const settings = settingsOf(data.game);
  const phase = data.game.phase;
  const canBoard = staff || (captain && BOARD_PHASES.includes(phase));
  const canSpec = staff || (captain && SPEC_PHASES.includes(phase));
  const canHqRequest = staff || (captain && HQ_REQUEST_PHASES.includes(phase));
  const spend = spendOf(data.purchases);
  const used = capacityUsed(data.placements, data.kams, settings);
  const specs = data.kams.filter((k) => k.specialization).length;
  const pending = data.purchases.filter((p) => p.status === 'pending').length;
  const failing = teamChecks(data).flatMap((g) => g.checks).filter((c) => !c.ok).length;
  const openClient: Client | undefined = openCode ? data.clients.find((c) => c.code === openCode) : undefined;
  const phaseAbout = PHASES.find((p) => p.id === phase)?.about;

  const tabs: TabDef<Tab>[] = [
    { id: 'board', label: 'Портфель', icon: <LayoutGrid size={16} /> },
    { id: 'shop', label: 'Магазин', icon: <ShoppingBag size={16} />, count: staff || captain ? pending : 0 },
    { id: 'hq', label: 'Запросы HQ', icon: <Lightbulb size={16} /> },
    { id: 'meetings', label: 'Встречи', icon: <Handshake size={16} /> },
    ...(staff || captain ? [{ id: 'checks' as const, label: 'Проверка', icon: <ClipboardCheck size={16} />, count: failing }] : []),
    { id: 'team', label: 'Команда', icon: <Users size={16} /> },
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'board';

  return (
    <>
      <section className="card team-hero">
        <div className="card-head">
          <div>
            <span className="section-title">Стол</span>
            <h1 className="team-name">{data.team.name}</h1>
            <div className="card-sub">
              {staff ? 'Режим куратора: вы проводите покупки и фиксируете результаты' : captain ? 'Вы капитан — решения вносите вы' : 'Решения вносит капитан, вы видите всё в реальном времени'}
              {phaseAbout ? ` · ${phaseAbout}` : ''}
            </div>
          </div>
          <div className="avatar-stack" aria-label="Состав стола">
            {data.members.slice(0, 6).map((m) => (
              <span key={m.id} title={m.full_name || m.username}>
                <Avatar name={m.full_name || m.username} />
              </span>
            ))}
            {data.members.length > 6 && <span className="avatar more">+{data.members.length - 6}</span>}
          </div>
        </div>
        <div className="stats">
          <Stat label="Sales Capacity" icon={<Gauge />} value={used} max={settings.capacity} />
          <Stat label="Бюджет" icon={<Coins />} value={spend.total} max={settings.budget} />
          {Array.from({ length: settings.ssm_count }, (_, i) => (
            <Stat
              key={i}
              label={`SSM ${i + 1}`}
              icon={<Headset />}
              value={data.placements.filter((p) => p.ssm === i + 1).length}
              max={settings.ssm_max_clients}
              segments
            />
          ))}
          <Stat label="Специализации" icon={<GraduationCap />} value={specs} max={settings.max_specs} segments />
        </div>
      </section>

      <Tabs tabs={tabs} value={activeTab} onChange={setTab} label="Разделы стола" />

      {activeTab === 'board' && (
        <TeamBoard
          clients={data.clients}
          placements={data.placements}
          kams={data.kams}
          purchases={data.purchases}
          settings={settings}
          canEdit={canBoard}
          canSpec={canSpec}
          onOpen={(c) => setOpenCode(c.code)}
          onMove={(client, bucket, kam, ssm) =>
            call('set_placement', { p_team: teamId, p_client: client, p_bucket: bucket ?? 'pool', p_kam: kam, p_ssm: ssm }, '')
          }
          onSpec={(kam, spec) => void call('set_kam_spec', { p_team: teamId, p_kam: kam, p_spec: spec })}
        />
      )}

      {activeTab === 'shop' && (
        <ShopPanel
          data={data}
          settings={settings}
          phase={phase}
          staff={staff}
          captain={captain}
          busy={busy}
          actions={actions}
          onOpenClient={(c) => setOpenCode(c.code)}
        />
      )}

      {activeTab === 'hq' && (
        <HqRequestsPanel
          requests={data.hqRequests}
          purchases={data.purchases}
          clients={data.clients}
          settings={settings}
          canCreate={canHqRequest}
          staff={staff}
          busy={busy}
          actions={actions}
        />
      )}

      {activeTab === 'meetings' && (
        <MeetingsPanel clients={data.clients} meetings={data.meetings} staff={staff} busy={busy} actions={actions} />
      )}

      {activeTab === 'checks' && <CheckpointsPanel data={data} />}

      {activeTab === 'team' && (
        <section className="card">
          <div className="card-title">
            <Users size={20} />
            <h2>Состав стола</h2>
          </div>
          <div className="grid-auto">
            {data.members.map((m) => (
              <div key={m.id} className="person">
                <Avatar name={m.full_name || m.username} />
                <div className="grow">
                  <span className="name">{m.full_name || m.username}</span>
                  <span className="handle">@{m.username}</span>
                </div>
                {m.role === 'captain' && <span className="badge badge-primary">Капитан</span>}
                {m.role === 'curator' && <span className="badge badge-gold">Куратор</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {openClient && (
        <ClientDialog
          client={openClient}
          hints={data.hints}
          placement={data.placements.find((p) => p.client_code === openClient.code)}
          staff={staff}
          onClose={() => setOpenCode(null)}
        />
      )}
    </>
  );
}
