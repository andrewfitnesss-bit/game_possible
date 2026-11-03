-- v0.2.3: капитан (и организаторы) переименовывают стол. Выполнять после 005_restart_game.sql.

create or replace function public.rename_team(p_team uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_game uuid;
begin
  if not (public.can_manage_team(p_team) or public.is_captain_of(p_team)) then raise exception 'E_NO_RIGHTS_RENAME'; end if;
  perform public.lock_team_game(p_team);
  if char_length(v_name) < 2 or char_length(v_name) > 40 then raise exception 'E_TEAM_NAME_LENGTH'; end if;
  select game_id into v_game from public.teams where id = p_team;
  if exists (select 1 from public.teams where game_id = v_game and id <> p_team and lower(name) = lower(v_name)) then
    raise exception 'E_TEAM_NAME_TAKEN';
  end if;
  update public.teams set name = v_name where id = p_team;
end $$;

revoke all on function public.rename_team(uuid, text) from public, anon;
grant execute on function public.rename_team(uuid, text) to authenticated;

-- Новое название стола сразу видно всем за столом и ведущей.
do $$
begin
  alter publication supabase_realtime add table public.teams;
exception when duplicate_object then null;
end $$;
