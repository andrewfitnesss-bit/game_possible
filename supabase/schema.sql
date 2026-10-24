-- Корпоративная игра: схема Supabase. Выполнить целиком в SQL Editor.
-- Перед запуском: Authentication -> Providers -> Email -> отключить "Confirm email".

create extension if not exists pgcrypto;

-- ============ Таблицы ============
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
-- Одновременно может быть только одна активная игра
create unique index if not exists games_one_active on public.games ((true)) where is_active;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null default '',
  role text not null default 'member' check (role in ('superadmin', 'captain', 'member')),
  game_id uuid references public.games(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  game_id uuid references public.games(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- Для уже созданной таблицы: колонка игры + индекс
alter table public.audit_log add column if not exists game_id uuid references public.games(id) on delete set null;
create index if not exists audit_log_game_idx on public.audit_log (game_id, id desc);

-- ============ Хелперы ============
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin');
$$;

drop function if exists public.write_audit(uuid, text, text, text, jsonb);
create or replace function public.write_audit(p_actor uuid, p_game uuid, p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, game_id, action, entity, entity_id, details)
  values (p_actor, p_game, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function public.write_audit(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ============ Регистрация: профиль создаётся автоматически ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text := lower(split_part(new.email, '@', 1));
  v_is_admin boolean := (lower(new.email) = 'superadmin@game.local');
  v_game uuid;
begin
  select id into v_game from public.games where is_active limit 1;
  insert into public.profiles (id, username, full_name, role, game_id)
  values (
    new.id,
    v_username,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100),
    case when v_is_admin then 'superadmin' else 'member' end,
    case when v_is_admin then null else v_game end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Аудит-триггеры ============
create or replace function public.audit_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.id, new.game_id, 'user_registered', 'profile', new.id::text,
      jsonb_build_object('username', new.username, 'role', new.role));
  elsif tg_op = 'UPDATE' then
    if new.team_id is distinct from old.team_id then
      perform public.write_audit(auth.uid(), new.game_id, 'user_team_changed', 'profile', new.id::text,
        jsonb_build_object('username', new.username, 'from', old.team_id, 'to', new.team_id));
    end if;
    if new.role is distinct from old.role then
      perform public.write_audit(auth.uid(), new.game_id, 'user_role_changed', 'profile', new.id::text,
        jsonb_build_object('username', new.username, 'from', old.role, 'to', new.role));
    end if;
    if new.game_id is distinct from old.game_id then
      perform public.write_audit(auth.uid(), new.game_id, 'user_game_changed', 'profile', new.id::text,
        jsonb_build_object('username', new.username, 'from', old.game_id, 'to', new.game_id));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after insert or update on public.profiles
  for each row execute function public.audit_profiles();

create or replace function public.audit_teams()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(auth.uid(), new.game_id, 'team_created', 'team', new.id::text, jsonb_build_object('name', new.name));
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.write_audit(auth.uid(), new.game_id, 'team_updated', 'team', new.id::text,
      jsonb_build_object('from', old.name, 'to', new.name));
    return new;
  else
    perform public.write_audit(auth.uid(), old.game_id, 'team_deleted', 'team', old.id::text, jsonb_build_object('name', old.name));
    return old;
  end if;
end $$;

drop trigger if exists trg_audit_teams on public.teams;
create trigger trg_audit_teams
  after insert or update or delete on public.teams
  for each row execute function public.audit_teams();

create or replace function public.audit_games()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(auth.uid(), new.id, 'game_created', 'game', new.id::text, jsonb_build_object('name', new.name));
  elsif new.is_active is distinct from old.is_active then
    perform public.write_audit(auth.uid(), new.id, case when new.is_active then 'game_activated' else 'game_finished' end,
      'game', new.id::text, jsonb_build_object('name', new.name));
  end if;
  return new;
end $$;

drop trigger if exists trg_audit_games on public.games;
create trigger trg_audit_games
  after insert or update on public.games
  for each row execute function public.audit_games();

-- ============ RPC (только супер-админ) ============
-- Запуск новой игры: старая завершается. Участники не переносятся: в новой игре регистрируются новые.
create or replace function public.start_game(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_superadmin() then raise exception 'forbidden'; end if;
  if p_name is null or char_length(trim(p_name)) = 0 then raise exception 'name required'; end if;
  update public.games set is_active = false where is_active;
  insert into public.games (name, is_active) values (trim(p_name), true) returning id into v_id;
  return v_id;
end $$;

-- Разделить поровну: случайно раскладывает всех участников активной игры по командам.
create or replace function public.split_evenly()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_game uuid;
  v_teams uuid[];
  v_n int;
  v_i int := 0;
  r record;
begin
  if not public.is_superadmin() then raise exception 'forbidden'; end if;
  select id into v_game from public.games where is_active;
  if v_game is null then raise exception 'no active game'; end if;
  select array_agg(id order by created_at, id) into v_teams from public.teams where game_id = v_game;
  v_n := coalesce(array_length(v_teams, 1), 0);
  if v_n = 0 then raise exception 'no teams'; end if;
  for r in select id from public.profiles where game_id = v_game and role <> 'superadmin' order by random() loop
    update public.profiles set team_id = v_teams[(v_i % v_n) + 1] where id = r.id;
    v_i := v_i + 1;
  end loop;
  perform public.write_audit(auth.uid(), v_game, 'split_evenly', 'game', v_game::text,
    jsonb_build_object('participants', v_i, 'teams', v_n));
end $$;

revoke all on function public.start_game(text) from public, anon;
revoke all on function public.split_evenly() from public, anon;
grant execute on function public.start_game(text) to authenticated;
grant execute on function public.split_evenly() to authenticated;

-- ============ RLS ============
alter table public.games enable row level security;
alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists games_select on public.games;
create policy games_select on public.games for select to authenticated using (true);
drop policy if exists games_admin_write on public.games;
create policy games_admin_write on public.games for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated using (true);
drop policy if exists teams_admin_write on public.teams;
create policy teams_admin_write on public.teams for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Читать профили могут все вошедшие; менять (роль, команду) - только супер-админ.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists audit_admin_select on public.audit_log;
create policy audit_admin_select on public.audit_log for select to authenticated using (public.is_superadmin());

-- Одноразовое заполнение game_id у старых записей аудита (где это возможно)
update public.audit_log a set game_id = g.id from public.games g
  where a.game_id is null and a.entity = 'game' and a.entity_id = g.id::text;
update public.audit_log a set game_id = t.game_id from public.teams t
  where a.game_id is null and a.entity = 'team' and a.entity_id = t.id::text;
update public.audit_log a set game_id = p.game_id from public.profiles p
  where a.game_id is null and a.entity = 'profile' and a.entity_id = p.id::text;

-- Realtime для профилей (экран ожидания обновляется сам)
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;
