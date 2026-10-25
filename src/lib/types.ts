export type Role = 'superadmin' | 'captain' | 'member' | 'curator';

export type Phase = 'lobby' | 'r1p1' | 'r1p2' | 'r1p3' | 'r2p1' | 'r2p2' | 'r3' | 'r4' | 'r5' | 'finished';

export interface Game {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  phase: Phase;
  phase_ends_at: string | null;
  settings: Partial<GameSettings>;
}

export interface GameSettings {
  budget: number;
  cap_info: number;
  cap_marketing: number;
  cap_hq: number;
  capacity: number;
  cost_active: number;
  cost_maintenance: number;
  cost_spec: number;
  kams: number;
  max_active_per_kam: number;
  max_maint_per_kam: number;
  ssm_count: number;
  ssm_max_clients: number;
  max_specs: number;
  max_hq_requests: number;
}

export interface Team {
  id: string;
  game_id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  game_id: string | null;
  team_id: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  game_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Client {
  code: string;
  name: string;
  industry: string;
  business: string;
  employees: string;
  kl_related: string;
  extra: string | null;
  sort: number;
  in_game: boolean;
}

export interface ClientHint {
  client_code: string;
  level: 1 | 2;
  body: string;
}

export type Category = 'info' | 'marketing' | 'hq';

export interface CatalogItem {
  code: string;
  category: Category;
  name: string;
  cost: number;
  max_targets: number;
  leads: number;
  description: string;
  sort: number;
}

export interface CatalogSecret {
  code: string;
  note: string;
}

export type Bucket = 'active' | 'maintenance' | 'midmarket';

export interface Placement {
  team_id: string;
  client_code: string;
  bucket: Bucket;
  kam: number | null;
  ssm: number | null;
}

export type Specialization = 'government' | 'industrial' | 'finance' | 'telecom' | 'other_enterprise';

export interface TeamKam {
  team_id: string;
  kam: number;
  specialization: Specialization | null;
}

export type PurchaseStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Purchase {
  id: number;
  team_id: string;
  item: string;
  request_id: number | null;
  category: Category;
  cost: number;
  targets: string[];
  justification: string;
  status: PurchaseStatus;
  note: string;
  requested_by: string | null;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface HqRequest {
  id: number;
  team_id: string;
  title: string;
  barrier: string;
  targets: string[];
  priority: 1 | 2 | 3;
  price: number | null;
  created_at: string;
}

export type MeetingOutcome = 'no_progress' | 'qualified' | 'strategic';

export interface MeetingResult {
  team_id: string;
  client_code: string;
  outcome: MeetingOutcome;
  amount: number;
  strength: string;
  improvement: string;
}
