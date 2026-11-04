import type { TKey, TVars } from '../i18n/prefs';
import type {
  CatalogItem,
  Category,
  Client,
  Game,
  GameSettings,
  MeetingResult,
  Phase,
  Placement,
  Profile,
  Purchase,
  Specialization,
  SpecTraining,
  TeamKam,
} from './types';

// Значения по умолчанию совпадают с public.gs() в supabase/003_budget_specs_prefs.sql.
export const DEFAULT_SETTINGS: GameSettings = {
  budget: 80,
  cap_info: 10,
  cap_marketing: 20,
  cap_hq: 25,
  cost_spec: 8,
  kams: 4,
  max_active_per_kam: 4,
  max_maint_per_kam: 1,
  ssm_count: 2,
  ssm_max_clients: 4,
  max_specs: 3,
  max_hq_requests: 3,
};

export function settingsOf(game: Game | null): GameSettings {
  return { ...DEFAULT_SETTINGS, ...(game?.settings ?? {}) };
}

export interface PhaseDef {
  id: Phase;
  minutes: number;
}

export const PHASES: PhaseDef[] = [
  { id: 'lobby', minutes: 0 },
  { id: 'r1p1', minutes: 15 },
  { id: 'r1p2', minutes: 15 },
  { id: 'r1p3', minutes: 20 },
  { id: 'r2p1', minutes: 20 },
  { id: 'r2p2', minutes: 20 },
  { id: 'r3', minutes: 90 },
  { id: 'r4', minutes: 20 },
  { id: 'r5', minutes: 70 },
  { id: 'finished', minutes: 0 },
];

/** Раунды с игровыми действиями (без «ожидания» и «завершена»). */
export const PLAYABLE_PHASES = PHASES.length - 2;

// Что капитан может делать в раунде. Куратор и админ не ограничены. Сервер проверяет то же самое.
export const BOARD_PHASES: Phase[] = ['r1p1', 'r1p2', 'r1p3', 'r2p1', 'r2p2', 'r3', 'r4'];
export const SPEC_PHASES: Phase[] = ['r1p3', 'r2p1', 'r2p2', 'r3', 'r4'];
/** До конца этих раундов обучение KAM можно сменить бесплатно (как public.spec_phase_free). */
export const FREE_SPEC_PHASES: Phase[] = ['lobby', 'r1p1', 'r1p2', 'r1p3'];
export const PURCHASE_PHASES: Record<Category, Phase[]> = {
  info: ['r1p2', 'r1p3'],
  marketing: ['r2p1'],
  hq: ['r2p2'],
};
export const HQ_REQUEST_PHASES: Phase[] = ['r2p2'];

export const SPECIALIZATIONS: Specialization[] = ['government', 'industrial', 'finance', 'telecom', 'other_enterprise'];

export interface Spend {
  total: number;
  specs: number;
  byCategory: Record<Category, number>;
}

/** Потрачено командой: проведённые покупки плюс все оплаченные обучения KAM (как public.team_spent). */
export function spendOf(purchases: Purchase[], trainings: SpecTraining[], s: GameSettings): Spend {
  const byCategory: Record<Category, number> = { info: 0, marketing: 0, hq: 0 };
  for (const p of purchases) if (p.status === 'approved') byCategory[p.category] += p.cost;
  const specs = trainings.length * s.cost_spec;
  return { total: byCategory.info + byCategory.marketing + byCategory.hq + specs, specs, byCategory };
}

export function categoryCap(s: GameSettings, c: Category): number {
  return c === 'info' ? s.cap_info : c === 'marketing' ? s.cap_marketing : s.cap_hq;
}

export function hasApproved(purchases: Purchase[], item: string, client?: string): boolean {
  return purchases.some(
    (p) => p.status === 'approved' && p.item === item && (client === undefined || p.targets.includes(client)),
  );
}

export interface Check {
  label: TKey;
  vars?: TVars;
  ok: boolean;
  detail?: { key: TKey; vars?: TVars };
}

export interface TeamState {
  clients: Client[];
  catalog: CatalogItem[];
  placements: Placement[];
  kams: TeamKam[];
  trainings: SpecTraining[];
  purchases: Purchase[];
  meetings: MeetingResult[];
  members: Profile[];
  settings: GameSettings;
}

/** Сколько монет спишет назначение специализации spec для KAM (0 — уже оплачено или бесплатная смена в R1.3). */
export function specCharge(phase: Phase, trainings: SpecTraining[], kam: number, spec: Specialization, s: GameSettings): number {
  if (trainings.some((t) => t.kam === kam && t.specialization === spec)) return 0;
  if (FREE_SPEC_PHASES.includes(phase) && trainings.some((t) => t.kam === kam && !t.locked)) return 0;
  return s.cost_spec;
}

function limitViolations(st: TeamState) {
  const { placements, settings: s } = st;
  const overKam: string[] = [];
  for (let k = 1; k <= s.kams; k += 1) {
    const active = placements.filter((p) => p.kam === k && p.bucket === 'active').length;
    const maint = placements.filter((p) => p.kam === k && p.bucket === 'maintenance').length;
    if (active > s.max_active_per_kam || maint > s.max_maint_per_kam) overKam.push(`KAM ${k}`);
  }
  const overSsm: string[] = [];
  for (let n = 1; n <= s.ssm_count; n += 1) {
    if (placements.filter((p) => p.ssm === n).length > s.ssm_max_clients) overSsm.push(`SSM ${n}`);
  }
  const spend = spendOf(st.purchases, st.trainings, s);
  const overBudget =
    spend.total > s.budget || (['info', 'marketing', 'hq'] as const).some((c) => spend.byCategory[c] > categoryCap(s, c));
  return { overKam, overSsm, overBudget, spend };
}

export function unplacedClients(clients: Client[], placements: Placement[]): Client[] {
  const placed = new Set(placements.map((p) => p.client_code));
  return clients.filter((c) => c.in_game && !placed.has(c.code));
}

// Контрольные точки из инструкции кураторов.
export function checkpoints(st: TeamState): { title: TKey; checks: Check[] }[] {
  const { clients, catalog, kams, purchases, meetings, settings: s } = st;
  const inGame = clients.filter((c) => c.in_game);
  const missing = unplacedClients(clients, st.placements).map((c) => c.code);
  const specs = kams.filter((k) => k.specialization).length;
  const { overKam, overSsm, overBudget, spend } = limitViolations(st);
  const needsTargets = new Set(catalog.filter((i) => i.category !== 'info' && i.max_targets > 0).map((i) => i.code));
  const untargeted = purchases.filter((p) => p.status === 'approved' && needsTargets.has(p.item) && !p.targets.length);

  return [
    {
      title: 'check.r1',
      checks: [
        {
          label: 'check.allPlaced',
          ok: missing.length === 0,
          detail: missing.length ? { key: 'check.notPlaced', vars: { list: missing.join(', ') } } : undefined,
        },
        {
          label: 'check.specs',
          ok: true,
          detail: specs ? { key: 'check.specsChosen', vars: { n: specs } } : { key: 'check.specsNone' },
        },
      ],
    },
    {
      title: 'check.r2',
      checks: [
        {
          label: 'check.targeted',
          ok: untargeted.length === 0,
          detail: untargeted.length
            ? { key: 'check.notPlaced', vars: { list: untargeted.map((p) => `#${p.id} ${p.item}`).join(', ') } }
            : undefined,
        },
      ],
    },
    {
      title: 'check.r3',
      checks: [{ label: 'check.meeting', ok: meetings.length > 0, detail: { key: 'check.records', vars: { n: meetings.length } } }],
    },
    {
      title: 'check.r4',
      checks: [
        { label: 'check.unique', vars: { n: inGame.length }, ok: missing.length === 0 },
        { label: 'check.kamLimits', ok: overKam.length === 0 },
        { label: 'check.ssmLimits', ok: overSsm.length === 0 },
        {
          label: 'check.budget',
          ok: !overBudget,
          detail: { key: 'check.budgetDetail', vars: { spent: spend.total, budget: s.budget } },
        },
      ],
    },
  ];
}

export interface ProgressStep {
  label: TKey;
  vars?: TVars;
  /** Доля выполнения шага от 0 до 1. */
  value: number;
}

export interface StageProgress {
  percent: number;
  steps: ProgressStep[];
}

// Прогресс текущего этапа стола — ведущий видит, кто отстаёт, а команда — что осталось сделать.
export function stageProgress(phase: Phase, st: TeamState): StageProgress {
  const s = st.settings;
  const inGame = st.clients.filter((c) => c.in_game).length;
  const placed = inGame - unplacedClients(st.clients, st.placements).length;
  const { overKam, overSsm, overBudget, spend } = limitViolations(st);
  const ssmSlots = s.ssm_count * s.ssm_max_clients;
  const ssmUsed = st.placements.filter((p) => p.ssm).length;
  const ratio = (a: number, b: number) => (b > 0 ? Math.min(a / b, 1) : 1);

  const placedStep: ProgressStep = { label: 'progress.placed', vars: { done: placed, total: inGame }, value: ratio(placed, inGame) };
  const budgetStep = (c: Category, label: TKey): ProgressStep => ({
    label,
    vars: { done: spend.byCategory[c], total: categoryCap(s, c) },
    value: ratio(spend.byCategory[c], categoryCap(s, c)),
  });

  let steps: ProgressStep[];
  switch (phase) {
    case 'lobby':
      steps = [{ label: 'progress.captain', value: st.members.some((m) => m.role === 'captain') ? 1 : 0 }];
      break;
    case 'r1p1':
      steps = [placedStep];
      break;
    case 'r1p2':
      steps = [placedStep, budgetStep('info', 'progress.hints')];
      break;
    case 'r1p3':
      steps = [
        placedStep,
        { label: 'progress.ssm', vars: { done: ssmUsed, total: ssmSlots }, value: ratio(ssmUsed, ssmSlots) },
        { label: 'progress.specs', value: st.kams.some((k) => k.specialization) ? 1 : 0 },
      ];
      break;
    case 'r2p1':
      steps = [budgetStep('marketing', 'progress.marketing')];
      break;
    case 'r2p2':
      steps = [budgetStep('hq', 'progress.hq')];
      break;
    case 'r3':
      steps = [{ label: 'progress.meetings', vars: { done: st.meetings.length }, value: st.meetings.length > 0 ? 1 : 0 }];
      break;
    case 'r4':
      steps = [placedStep, { label: 'progress.limits', value: !overKam.length && !overSsm.length && !overBudget ? 1 : 0 }];
      break;
    default:
      steps = [{ label: 'progress.defense', value: 1 }];
  }
  const percent = Math.round((steps.reduce((sum, x) => sum + x.value, 0) / steps.length) * 100);
  return { percent, steps };
}
