import type {
  CatalogItem,
  Category,
  Client,
  Game,
  GameSettings,
  MeetingOutcome,
  Phase,
  Placement,
  Purchase,
  Specialization,
  TeamKam,
} from './types';

// Значения по умолчанию совпадают с public.gs() в supabase/002_nal_game.sql.
export const DEFAULT_SETTINGS: GameSettings = {
  budget: 80,
  cap_info: 10,
  cap_marketing: 20,
  cap_hq: 25,
  capacity: 170,
  cost_active: 10,
  cost_maintenance: 2.5,
  cost_spec: 8,
  kams: 4,
  max_active_per_kam: 4,
  max_maint_per_kam: 1,
  ssm_count: 2,
  ssm_max_clients: 4,
  max_specs: 3,
  max_hq_requests: 3,
};

export const SETTING_LABEL: Record<keyof GameSettings, string> = {
  budget: 'Общий бюджет, монет',
  cap_info: 'Лимит: информация',
  cap_marketing: 'Лимит: маркетинг',
  cap_hq: 'Лимит: HQ',
  capacity: 'Sales Capacity',
  cost_active: 'Capacity за Active',
  cost_maintenance: 'Capacity за Maintenance',
  cost_spec: 'Capacity за специализацию',
  kams: 'Число KAM',
  max_active_per_kam: 'Active на KAM, максимум',
  max_maint_per_kam: 'Maintenance на KAM, максимум',
  ssm_count: 'Число SSM',
  ssm_max_clients: 'Клиентов на SSM, максимум',
  max_specs: 'Специализаций на команду',
  max_hq_requests: 'Запросов к HQ на команду',
};

export function settingsOf(game: Game | null): GameSettings {
  return { ...DEFAULT_SETTINGS, ...(game?.settings ?? {}) };
}

export const PHASES: { id: Phase; label: string; minutes: number }[] = [
  { id: 'lobby', label: 'Ожидание старта', minutes: 0 },
  { id: 'r1p1', label: 'Round 1.1 — Build the Initial NAL', minutes: 15 },
  { id: 'r1p2', label: 'Round 1.2 — Доп. информация о клиентах', minutes: 15 },
  { id: 'r1p3', label: 'Round 1.3 — Specialization и пересортировка', minutes: 20 },
  { id: 'r2p1', label: 'Round 2.1 — Local Marketing Investment Board', minutes: 20 },
  { id: 'r2p2', label: 'Round 2.2 — HQ Capability Investment Board', minutes: 20 },
  { id: 'r3', label: 'Round 3 — Встречи с клиентом', minutes: 90 },
  { id: 'r4', label: 'Round 4 — Финальная корректировка', minutes: 20 },
  { id: 'r5', label: 'Round 5 — Защита стратегии', minutes: 70 },
  { id: 'finished', label: 'Игра завершена', minutes: 0 },
];

export function phaseLabel(phase: Phase): string {
  return PHASES.find((p) => p.id === phase)?.label ?? phase;
}

// Что капитан может делать в раунде. Куратор и админ не ограничены. Сервер проверяет то же самое.
export const BOARD_PHASES: Phase[] = ['r1p1', 'r1p2', 'r1p3', 'r2p1', 'r2p2', 'r3', 'r4'];
export const SPEC_PHASES: Phase[] = ['r1p3'];
export const PURCHASE_PHASES: Record<Category, Phase[]> = {
  info: ['r1p2', 'r1p3'],
  marketing: ['r2p1'],
  hq: ['r2p2'],
};
export const HQ_REQUEST_PHASES: Phase[] = ['r2p2'];

export const CATEGORY_LABEL: Record<Category, string> = {
  info: 'Информация',
  marketing: 'Маркетинг',
  hq: 'HQ',
};

export const SPEC_LABEL: Record<Specialization, string> = {
  government: 'Government',
  industrial: 'Industrial / OT',
  finance: 'Finance / Banking',
  telecom: 'Telecom',
  other_enterprise: 'Other Enterprise (TI)',
};

export const OUTCOME_LABEL: Record<MeetingOutcome, string> = {
  no_progress: 'No Progress',
  qualified: 'Qualified Opportunity',
  strategic: 'Strategic Access',
};

export const STATUS_LABEL = {
  pending: 'Ждёт куратора',
  approved: 'Проведена',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
} as const;

export function capacityUsed(placements: Placement[], kams: TeamKam[], s: GameSettings): number {
  let used = 0;
  for (const p of placements) {
    if (p.bucket === 'active') used += s.cost_active;
    else if (p.bucket === 'maintenance') used += s.cost_maintenance;
  }
  return used + kams.filter((k) => k.specialization).length * s.cost_spec;
}

export interface Spend {
  total: number;
  byCategory: Record<Category, number>;
}

export function spendOf(purchases: Purchase[]): Spend {
  const byCategory: Record<Category, number> = { info: 0, marketing: 0, hq: 0 };
  for (const p of purchases) if (p.status === 'approved') byCategory[p.category] += p.cost;
  return { total: byCategory.info + byCategory.marketing + byCategory.hq, byCategory };
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
  label: string;
  ok: boolean;
  detail?: string;
}

// Контрольные точки из инструкции кураторов.
export function checkpoints(input: {
  clients: Client[];
  catalog: CatalogItem[];
  placements: Placement[];
  kams: TeamKam[];
  purchases: Purchase[];
  meetings: number;
  settings: GameSettings;
}): { title: string; checks: Check[] }[] {
  const { clients, catalog, placements, kams, purchases, meetings, settings: s } = input;
  const inGame = clients.filter((c) => c.in_game);
  const placed = new Set(placements.map((p) => p.client_code));
  const missing = inGame.filter((c) => !placed.has(c.code)).map((c) => c.code);
  const used = capacityUsed(placements, kams, s);
  const spend = spendOf(purchases);
  const pending = purchases.filter((p) => p.status === 'pending').length;
  const specs = kams.filter((k) => k.specialization).length;

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
  const overCat = (['info', 'marketing', 'hq'] as const).filter((c) => spend.byCategory[c] > categoryCap(s, c));
  const needsTargets = new Set(catalog.filter((i) => i.category !== 'info' && i.max_targets > 0).map((i) => i.code));
  const untargeted = purchases.filter((p) => p.status === 'approved' && needsTargets.has(p.item) && !p.targets.length);

  return [
    {
      title: 'После раунда 1',
      checks: [
        {
          label: 'Все клиенты распределены',
          ok: missing.length === 0,
          detail: missing.length ? `Не распределены: ${missing.join(', ')}` : undefined,
        },
        { label: 'Специализации проверены', ok: true, detail: specs ? `Выбрано: ${specs}` : 'Специализаций нет' },
      ],
    },
    {
      title: 'После раунда 2',
      checks: [
        { label: 'Нет необработанных заявок', ok: pending === 0, detail: pending ? `Ждут решения: ${pending}` : undefined },
        {
          label: 'У адресных покупок указаны клиенты',
          ok: untargeted.length === 0,
          detail: untargeted.length ? untargeted.map((p) => `#${p.id} ${p.item}`).join(', ') : undefined,
        },
      ],
    },
    {
      title: 'После раунда 3',
      checks: [{ label: 'Результат встречи зафиксирован', ok: meetings > 0, detail: `Записей: ${meetings}` }],
    },
    {
      title: 'После раунда 4',
      checks: [
        { label: `${inGame.length} уникальных итоговых записей`, ok: missing.length === 0 },
        { label: 'Sales Capacity соблюдена', ok: used <= s.capacity, detail: `${used} из ${s.capacity}` },
        { label: 'Лимиты KAM соблюдены', ok: overKam.length === 0, detail: overKam.join(', ') || undefined },
        { label: 'Лимиты SSM соблюдены', ok: overSsm.length === 0, detail: overSsm.join(', ') || undefined },
        {
          label: 'Бюджет соблюдён',
          ok: spend.total <= s.budget && overCat.length === 0,
          detail: `${spend.total} из ${s.budget} монет`,
        },
      ],
    },
  ];
}
