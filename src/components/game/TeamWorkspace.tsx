import { useCallback, useMemo, useState } from 'react';
import {
  CircleCheck,
  ClipboardCheck,
  Coins,
  Flag,
  GraduationCap,
  Handshake,
  Headset,
  LayoutGrid,
  Lightbulb,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { useT, type TKey } from '../../i18n/prefs';
import { BOARD_PHASES, FREE_SPEC_PHASES, HQ_REQUEST_PHASES, PURCHASE_PHASES, settingsOf, SPEC_PHASES, specCharge, spendOf, stageProgress, unplacedClients } from '../../lib/game';
import { errText } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import type { Client, Specialization } from '../../lib/types';
import { teamState, useTeamData } from '../../lib/useTeamData';
import { useConfirm } from '../../ui/Confirm';
import { chaChing } from '../../ui/MoneyRain';
import { useToast } from '../../ui/Toast';
import { Avatar, Loading, Stat, Tabs, type TabDef } from '../../ui/kit';
import type { WorkspaceActions } from './actions';
import { CheckpointsPanel, teamChecks } from './CheckpointsPanel';
import { ClientDialog } from './ClientDialog';
import { HqRequestsPanel } from './HqRequestsPanel';
import { MeetingsPanel } from './MeetingsPanel';
import { ShopPanel } from './ShopPanel';
import { TeamBoard } from './TeamBoard';
import { TeamName } from './TeamName';

export type WorkspaceMode = 'viewer' | 'captain' | 'staff';
type Tab = 'board' | 'shop' | 'hq' | 'meetings' | 'checks' | 'team';

const TAB_KEY = 'nal-ws-tab';
const TAB_IDS: Tab[] = ['board', 'shop', 'hq', 'meetings', 'checks', 'team'];

function readTab(): Tab {
  try {
    const v = sessionStorage.getItem(TAB_KEY);
    if (v && (TAB_IDS as string[]).includes(v)) return v as Tab;
  } catch {
    // sessionStorage недоступен (приватный режим) — начинаем с доски.
  }
  return 'board';
}

export function TeamWorkspace({ teamId, mode }: { teamId: string; mode: WorkspaceMode }) {
  const { data, error: loadError, reload } = useTeamData(teamId);
  const t = useT();
  const toast = useToast();
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const [tab, setTabState] = useState<Tab>(readTab);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      sessionStorage.setItem(TAB_KEY, next);
    } catch {
      // Не критично: вкладка просто не запомнится.
    }
  };

  // Вызов RPC: права и лимиты проверяет сервер, здесь только сообщаем результат.
  const call = useCallback(
    async (fn: string, args: Record<string, unknown>, success?: TKey): Promise<boolean> => {
      setBusy(true);
      try {
        const { error } = await supabase.rpc(fn, args);
        if (error) {
          toast.error(errText(error, t));
          return false;
        }
        if (success) toast.success(t(success));
        if (fn === 'create_purchase' || fn === 'set_kam_spec') chaChing();
        return true;
      } catch (e) {
        toast.error(errText(e, t));
        return false;
      } finally {
        setBusy(false);
        void reload();
      }
    },
    [reload, toast, t],
  );

  const actions = useMemo<WorkspaceActions>(
    () => ({
      createPurchase: (item, targets, justification, requestId) =>
        call('create_purchase', { p_team: teamId, p_item: item, p_targets: targets, p_justification: justification, p_request: requestId }, 'shop.done'),
      cancelPurchase: (id, note) => call('cancel_purchase', { p_id: id, p_note: note }, 'history.cancelled'),
      createHqRequest: (title, barrier, targets, priority) =>
        call('create_hq_request', { p_team: teamId, p_title: title, p_barrier: barrier, p_targets: targets, p_priority: priority }, 'hq.added'),
      priceHqRequest: (id, price) => call('price_hq_request', { p_id: id, p_price: price }, 'hq.priced'),
      deleteHqRequest: (id) => call('delete_hq_request', { p_id: id }, 'hq.deleted'),
      saveMeeting: (r) =>
        call(
          'set_meeting_result',
          { p_team: teamId, p_client: r.client_code, p_outcome: r.outcome, p_amount: r.amount, p_strength: r.strength, p_improvement: r.improvement },
          'meet.saved',
        ),
      deleteMeeting: (client) =>
        call('set_meeting_result', { p_team: teamId, p_client: client, p_outcome: null, p_amount: 0, p_strength: '', p_improvement: '' }, 'meet.deleted'),
    }),
    [call, teamId],
  );

  if (!data) {
    if (loadError) return <div className="callout callout-danger" role="alert">{loadError}</div>;
    return <Loading text={t('ws.loading')} />;
  }

  const staff = mode === 'staff';
  const captain = mode === 'captain';
  const settings = settingsOf(data.game);
  const phase = data.game.phase;
  const canBoard = staff || (captain && BOARD_PHASES.includes(phase));
  const canSpec = staff || (captain && SPEC_PHASES.includes(phase));
  const canHqRequest = staff || (captain && HQ_REQUEST_PHASES.includes(phase));
  const state = teamState(data);
  const spend = spendOf(data.purchases, data.trainings, settings);
  const progress = stageProgress(phase, state);
  const specs = data.kams.filter((k) => k.specialization).length;
  const unplaced = unplacedClients(data.clients, data.placements).length;
  const failing = teamChecks(data).flatMap((g) => g.checks).filter((c) => !c.ok).length;
  const openClient: Client | undefined = openCode ? data.clients.find((c) => c.code === openCode) : undefined;
  const todo = progress.steps.filter((s) => s.value < 1);

  const canBuyHints = staff || (captain && PURCHASE_PHASES.info.includes(phase));
  const hintLock = canBuyHints ? null : captain || staff ? t('client.opensIn', { phase: t(`phaseShort.${PURCHASE_PHASES.info[0]}` as TKey) }) : t('client.captainBuys');

  // Подсказка покупается сразу, после подтверждения необратимости. Используется в магазине и в карточке клиента.
  async function buyHint(item: 'HINT1' | 'HINT2', c: Client): Promise<boolean> {
    const ok = await ask({
      title: t('shop.buyHintTitle', { hint: item === 'HINT1' ? 'Hint 1' : 'Hint 2', code: c.code }),
      message: t('shop.buyHintText', { name: c.name }),
      confirmLabel: t('shop.buyFor', { n: 1 }),
    });
    return ok !== null && actions.createPurchase(item, [c.code], '', null);
  }

  // Обучение стоит монеты: до конца R1.3 его можно бесплатно сменить, потом каждое новое — за новые монеты.
  async function changeSpec(kam: number, spec: Specialization | null) {
    const free = FREE_SPEC_PHASES.includes(phase);
    const current = data?.kams.find((k) => k.kam === kam)?.specialization ?? null;
    const cost = spec ? specCharge(phase, data?.trainings ?? [], kam, spec, settings) : 0;
    if (spec && cost > 0) {
      const ok = await ask({
        title: t('board.specConfirmTitle', { n: kam, spec: t(`spec.${spec}` as TKey) }),
        message: free ? t('board.specConfirmText', { cost }) : t('board.specRetrainText', { cost }),
        confirmLabel: t('board.specConfirm', { cost }),
      });
      if (ok === null) return;
    } else if (!spec && current && !free) {
      const ok = await ask({ title: t('board.specRemoveTitle', { n: kam }), message: t('board.specRemoveText'), confirmLabel: t('common.confirm'), danger: true });
      if (ok === null) return;
    }
    void call('set_kam_spec', { p_team: teamId, p_kam: kam, p_spec: spec });
  }

  const tabs: TabDef<Tab>[] = [
    { id: 'board', label: t('ws.tabBoard'), icon: <LayoutGrid size={16} />, count: canBoard ? unplaced : 0 },
    { id: 'shop', label: t('ws.tabShop'), icon: <ShoppingBag size={16} /> },
    { id: 'hq', label: t('ws.tabHq'), icon: <Lightbulb size={16} /> },
    { id: 'meetings', label: t('ws.tabMeetings'), icon: <Handshake size={16} /> },
    ...(staff || captain ? [{ id: 'checks' as const, label: t('ws.tabChecks'), icon: <ClipboardCheck size={16} />, count: failing }] : []),
    { id: 'team', label: t('ws.tabTeam'), icon: <Users size={16} /> },
  ];
  const activeTab = tabs.some((x) => x.id === tab) ? tab : 'board';

  return (
    <>
      <section className="card team-hero">
        <div className="card-head">
          <div>
            <span className="section-title">{t('ws.table')}</span>
            <TeamName
              name={data.team.name}
              canRename={staff || captain}
              busy={busy}
              onRename={(name) => call('rename_team', { p_team: teamId, p_name: name }, 'ws.renamed')}
            />
            <div className="card-sub">
              {staff ? t('ws.modeStaff') : captain ? t('ws.modeCaptain') : t('ws.modeViewer')} · {t(`phaseAbout.${phase}` as TKey)}
            </div>
          </div>
          <div className="avatar-stack">
            {data.members.slice(0, 6).map((m) => (
              <span key={m.id} title={m.full_name || m.username}>
                <Avatar name={m.full_name || m.username} />
              </span>
            ))}
            {data.members.length > 6 && <span className="avatar more">+{data.members.length - 6}</span>}
          </div>
        </div>
        <div className="stats">
          <Stat label={t('ws.statProgress')} icon={<Flag />} value={progress.percent} max={100} suffix="%" />
          <Stat label={t('ws.statBudget')} icon={<Coins />} value={spend.total} max={settings.budget} />
          {Array.from({ length: settings.ssm_count }, (_, i) => (
            <Stat
              key={i}
              label={t('ws.statSsm', { n: i + 1 })}
              icon={<Headset />}
              value={data.placements.filter((p) => p.ssm === i + 1).length}
              max={settings.ssm_max_clients}
              segments
            />
          ))}
          <Stat label={t('ws.statSpecs')} icon={<GraduationCap />} value={specs} max={settings.max_specs} segments />
        </div>
        {(captain || staff) &&
          (todo.length ? (
            <div className="todo">
              <span className="section-title">{t('ws.todo')}</span>
              {todo.map((s) => (
                <span key={s.label} className="todo-item">
                  {t(s.label, s.vars)}
                </span>
              ))}
            </div>
          ) : (
            <div className="todo done">
              <CircleCheck size={16} /> {t('ws.stageDone')}
            </div>
          ))}
      </section>

      <Tabs tabs={tabs} value={activeTab} onChange={setTab} label={t('ws.sections')} />

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
          onMove={(client, bucket, kam, ssm) => call('set_placement', { p_team: teamId, p_client: client, p_bucket: bucket ?? 'pool', p_kam: kam, p_ssm: ssm })}
          onSpec={(kam, spec) => void changeSpec(kam, spec)}
        />
      )}

      {activeTab === 'shop' && (
        <ShopPanel
          data={data}
          settings={settings}
          spend={spend}
          phase={phase}
          staff={staff}
          captain={captain}
          busy={busy}
          actions={actions}
          canBuyHints={canBuyHints}
          onBuyHint={buyHint}
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

      {activeTab === 'meetings' && <MeetingsPanel clients={data.clients} meetings={data.meetings} staff={staff} busy={busy} actions={actions} />}

      {activeTab === 'checks' && <CheckpointsPanel data={data} />}

      {activeTab === 'team' && (
        <section className="card">
          <div className="card-title">
            <Users size={20} />
            <h2>{t('ws.members')}</h2>
          </div>
          <div className="grid-auto">
            {data.members.map((m) => (
              <div key={m.id} className="person">
                <Avatar name={m.full_name || m.username} />
                <div className="grow">
                  <span className="name">{m.full_name || m.username}</span>
                  <span className="handle">@{m.username}</span>
                </div>
                {m.role === 'captain' && <span className="badge badge-primary">{t('role.captain')}</span>}
                {m.role === 'curator' && <span className="badge badge-gold">{t('role.curator')}</span>}
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
          busy={busy}
          hintLock={hintLock}
          onBuyHint={(item) => buyHint(item, openClient)}
          onClose={() => setOpenCode(null)}
        />
      )}
    </>
  );
}
