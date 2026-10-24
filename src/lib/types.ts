export type Role = 'superadmin' | 'captain' | 'member';

export interface Game {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
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
