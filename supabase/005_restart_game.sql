-- v0.2.2: перезапуск игры и перенос игроков. Выполнять после 004_spec_trainings.sql.
-- Режимы запуска новой игры:
--   restart — те же столы и люди с ролями, доски и бюджеты с нуля;
--   reseat  — все игроки переходят в новую игру и ждут рассадки (капитаны становятся участниками);
--   empty   — пустая игра, участники регистрируются заново.

drop function if exists public.start_game(text);

create or replace function public.start_game(p_name text, p_mode text default 'restart')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_old uuid;
  v_id uuid;
  v_team uuid;
  v_moved int := 0;
  r record;
begin
  if not public.is_superadmin() then raise exception 'E_NO_RIGHTS'; end if;
  if p_name is null or char_length(trim(p_name)) = 0 then raise exception 'E_NAME_REQUIRED'; end if;
  if p_mode not in ('restart', 'reseat', 'empty') then raise exception 'E_MODE'; end if;

  select id into v_old from public.games where is_active;
  update public.games set is_active = false where is_active;
  insert into public.games (name, is_active) values (trim(p_name), true) returning id into v_id;

  if v_old is not null and p_mode = 'restart' then
    for r in select id, name from public.teams where game_id = v_old order by created_at, id loop
      insert into public.teams (game_id, name) values (v_id, r.name) returning id into v_team;
      update public.profiles set game_id = v_id, team_id = v_team where team_id = r.id and role <> 'superadmin';
    end loop;
    update public.profiles set game_id = v_id, team_id = null
      where (game_id = v_old or game_id is null) and role <> 'superadmin';
  elsif p_mode = 'reseat' then
    -- Игроки прошлой игры и те, кто уже вышел из завершённой игры и ждёт.
    update public.profiles
      set game_id = v_id, team_id = null, role = case when role = 'captain' then 'member' else role end
      where (game_id = v_old or game_id is null) and role <> 'superadmin';
  end if;

  select count(*) into v_moved from public.profiles where game_id = v_id;
  perform public.write_audit(auth.uid(), v_id, 'game_started', 'game', v_id::text,
    jsonb_build_object('name', trim(p_name), 'mode', p_mode, 'players', v_moved));
  return v_id;
end $$;

-- Перенос игроков, оставшихся в прошлых играх, в текущую. Стол подбирается по совпадению названия,
-- если такого стола нет — игрок ждёт рассадки, а капитан становится участником.
create or replace function public.adopt_players()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_game uuid;
  v_count int;
begin
  if not public.is_superadmin() then raise exception 'E_NO_RIGHTS'; end if;
  select id into v_game from public.games where is_active;
  if v_game is null then raise exception 'E_NO_GAME'; end if;

  with moved as (
    select p.id,
      (select nt.id from public.teams ot
         join public.teams nt on nt.game_id = v_game and nt.name = ot.name
         where ot.id = p.team_id
         order by nt.created_at limit 1) as new_team
    from public.profiles p
    where p.role <> 'superadmin' and p.game_id is distinct from v_game
  )
  update public.profiles p
    set game_id = v_game,
        team_id = m.new_team,
        role = case when p.role = 'captain' and m.new_team is null then 'member' else p.role end
    from moved m
    where p.id = m.id;
  get diagnostics v_count = row_count;

  perform public.write_audit(auth.uid(), v_game, 'players_adopted', 'game', v_game::text, jsonb_build_object('players', v_count));
  return v_count;
end $$;

-- Игрок сам выходит из завершённой игры и ждёт распределения в новую (или в текущую, если она уже идёт).
create or replace function public.leave_finished_game()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_game uuid;
  v_active uuid;
begin
  if auth.uid() is null then raise exception 'E_NO_RIGHTS'; end if;
  select game_id into v_game from public.profiles where id = auth.uid() and role <> 'superadmin';
  if v_game is not null and exists (select 1 from public.games where id = v_game and is_active) then
    raise exception 'E_GAME_ACTIVE';
  end if;
  select id into v_active from public.games where is_active;
  update public.profiles
    set game_id = v_active, team_id = null, role = case when role = 'captain' then 'member' else role end
    where id = auth.uid() and role <> 'superadmin';
end $$;

revoke all on function public.leave_finished_game() from public, anon;
grant execute on function public.leave_finished_game() to authenticated;
revoke all on function public.start_game(text, text) from public, anon;
revoke all on function public.adopt_players() from public, anon;
grant execute on function public.start_game(text, text) to authenticated;
grant execute on function public.adopt_players() to authenticated;
