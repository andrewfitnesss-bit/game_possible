-- v0.2: без Sales Capacity, специализация стоит монеты, покупки без подтверждения куратора,
-- коды ошибок для перевода интерфейса, личные настройки игрока. Выполнять после 002_nal_game.sql.
-- Ошибки имеют вид 'E_КОД|арг1|арг2' — клиент переводит их на язык игрока.

-- ============ Личные настройки (тема, режим, язык) ============
alter table public.profiles add column if not exists prefs jsonb not null default '{}'::jsonb;

create or replace function public.set_my_prefs(p_prefs jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'E_NO_RIGHTS'; end if;
  if coalesce(p_prefs ->> 'theme', 'arena') not in ('arena', 'corp')
     or coalesce(p_prefs ->> 'mode', 'system') not in ('light', 'dark', 'system')
     or coalesce(p_prefs ->> 'lang', 'ru') not in ('ru', 'en') then
    raise exception 'E_PREFS';
  end if;
  update public.profiles
    set prefs = jsonb_build_object(
      'theme', coalesce(p_prefs ->> 'theme', 'arena'),
      'mode', coalesce(p_prefs ->> 'mode', 'system'),
      'lang', coalesce(p_prefs ->> 'lang', 'ru'))
    where id = auth.uid();
end $$;
revoke all on function public.set_my_prefs(jsonb) from public, anon;
grant execute on function public.set_my_prefs(jsonb) to authenticated;

-- ============ Настройки по умолчанию ============
create or replace function public.gs(p_settings jsonb, p_key text)
returns numeric language sql immutable as $$
  select coalesce((p_settings ->> p_key)::numeric, (jsonb_build_object(
    'budget', 80, 'cap_info', 10, 'cap_marketing', 20, 'cap_hq', 25, 'cost_spec', 8,
    'kams', 4, 'max_active_per_kam', 4, 'max_maint_per_kam', 1,
    'ssm_count', 2, 'ssm_max_clients', 4, 'max_specs', 3, 'max_hq_requests', 3
  ) ->> p_key)::numeric);
$$;

drop function if exists public.capacity_used(uuid, jsonb, text);

-- Потрачено командой: проведённые покупки + обучение KAM.
create or replace function public.team_spent(p_team uuid, p_settings jsonb)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(cost) from public.purchases where team_id = p_team and status = 'approved'), 0)
    + (select count(*) from public.team_kams where team_id = p_team and specialization is not null)
      * public.gs(p_settings, 'cost_spec');
$$;
revoke all on function public.team_spent(uuid, jsonb) from public, anon, authenticated;

create or replace function public.lock_team_game(p_team uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  perform 1 from public.teams where id = p_team for update;
  select gm.* into g from public.teams t join public.games gm on gm.id = t.game_id where t.id = p_team;
  if g.id is null then raise exception 'E_TEAM_NOT_FOUND'; end if;
  if not g.is_active then raise exception 'E_GAME_FINISHED'; end if;
  return g;
end $$;
revoke all on function public.lock_team_game(uuid) from public, anon, authenticated;

-- ============ Доска (без Sales Capacity) ============
create or replace function public.set_placement(p_team uuid, p_client text, p_bucket text, p_kam int, p_ssm int)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  s jsonb;
begin
  if not (public.can_manage_team(p_team) or public.is_captain_of(p_team)) then raise exception 'E_NO_RIGHTS_BOARD'; end if;
  g := public.lock_team_game(p_team);
  s := g.settings;
  if not public.can_manage_team(p_team)
     and g.phase not in ('r1p1', 'r1p2', 'r1p3', 'r2p1', 'r2p2', 'r3', 'r4') then
    raise exception 'E_PHASE_BOARD';
  end if;
  if not exists (select 1 from public.clients where code = p_client and in_game) then
    raise exception 'E_CLIENT_NOT_IN_GAME|%', p_client;
  end if;

  if p_bucket is null or p_bucket = 'pool' then
    delete from public.placements where team_id = p_team and client_code = p_client;
    return;
  end if;
  if p_bucket not in ('active', 'maintenance', 'midmarket') then raise exception 'E_BUCKET'; end if;
  if p_bucket = 'midmarket' then p_kam := null; end if;
  if p_bucket <> 'active' then p_ssm := null; end if;
  if p_bucket <> 'midmarket' and (p_kam is null or p_kam < 1 or p_kam > public.gs(s, 'kams')) then
    raise exception 'E_KAM_REQUIRED';
  end if;
  if p_ssm is not null and (p_ssm < 1 or p_ssm > public.gs(s, 'ssm_count')) then raise exception 'E_NO_SSM'; end if;

  if p_bucket = 'active' and (select count(*) from public.placements
      where team_id = p_team and bucket = 'active' and kam = p_kam and client_code <> p_client)
      >= public.gs(s, 'max_active_per_kam') then
    raise exception 'E_KAM_ACTIVE_FULL|%|%', p_kam, public.gs(s, 'max_active_per_kam');
  end if;
  if p_bucket = 'maintenance' and (select count(*) from public.placements
      where team_id = p_team and bucket = 'maintenance' and kam = p_kam and client_code <> p_client)
      >= public.gs(s, 'max_maint_per_kam') then
    raise exception 'E_KAM_MAINT_FULL|%|%', p_kam, public.gs(s, 'max_maint_per_kam');
  end if;
  if p_ssm is not null and (select count(*) from public.placements
      where team_id = p_team and ssm = p_ssm and client_code <> p_client) >= public.gs(s, 'ssm_max_clients') then
    raise exception 'E_SSM_FULL|%|%', p_ssm, public.gs(s, 'ssm_max_clients');
  end if;

  insert into public.placements (team_id, client_code, bucket, kam, ssm, updated_at)
  values (p_team, p_client, p_bucket, p_kam, p_ssm, now())
  on conflict (team_id, client_code) do update
    set bucket = excluded.bucket, kam = excluded.kam, ssm = excluded.ssm, updated_at = now();
end $$;

-- ============ Специализация KAM: стоит монеты из общего бюджета ============
create or replace function public.set_kam_spec(p_team uuid, p_kam int, p_spec text)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  s jsonb;
  v_old text;
begin
  if not (public.can_manage_team(p_team) or public.is_captain_of(p_team)) then raise exception 'E_NO_RIGHTS_SPEC'; end if;
  g := public.lock_team_game(p_team);
  s := g.settings;
  if not public.can_manage_team(p_team) and g.phase <> 'r1p3' then raise exception 'E_PHASE_SPEC'; end if;
  if p_kam is null or p_kam < 1 or p_kam > public.gs(s, 'kams') then raise exception 'E_NO_KAM'; end if;
  if p_spec is not null and p_spec not in ('government', 'industrial', 'finance', 'telecom', 'other_enterprise') then
    raise exception 'E_SPEC_UNKNOWN';
  end if;
  if p_spec = 'other_enterprise' and not public.team_has_item(p_team, 'CONSULT', null) then
    raise exception 'E_SPEC_LOCKED';
  end if;

  select specialization into v_old from public.team_kams where team_id = p_team and kam = p_kam;
  if p_spec is not distinct from v_old then return; end if;

  if p_spec is not null then
    if exists (select 1 from public.team_kams where team_id = p_team and kam <> p_kam and specialization = p_spec) then
      raise exception 'E_SPEC_DUPLICATE';
    end if;
    if v_old is null then
      if (select count(*) from public.team_kams where team_id = p_team and specialization is not null)
         >= public.gs(s, 'max_specs') then
        raise exception 'E_SPEC_MAX|%', public.gs(s, 'max_specs');
      end if;
      if public.team_spent(p_team, s) + public.gs(s, 'cost_spec') > public.gs(s, 'budget') then
        raise exception 'E_BUDGET|%|%|%', public.team_spent(p_team, s), public.gs(s, 'budget'), public.gs(s, 'cost_spec');
      end if;
    end if;
  end if;

  insert into public.team_kams (team_id, kam, specialization) values (p_team, p_kam, p_spec)
  on conflict (team_id, kam) do update set specialization = excluded.specialization;
end $$;

-- ============ Покупки: проводятся сразу ============
create or replace function public.validate_purchase(
  p_team uuid, s jsonb, p_item text, p_category text, p_cost int, p_targets text[], p_request bigint, p_skip bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_max int;
  v_spent_cat numeric;
  v_spent_all numeric;
  v_cap numeric;
  v_bad text;
begin
  if p_item = 'REQ' then
    if p_request is null then raise exception 'E_REQ_MISSING'; end if;
    if exists (select 1 from public.purchases where request_id = p_request and status in ('pending', 'approved')
               and id is distinct from p_skip) then
      raise exception 'E_REQ_BOUGHT';
    end if;
  else
    select max_targets into v_max from public.catalog_items where code = p_item;
    if p_item in ('HINT1', 'HINT2') then
      if coalesce(array_length(p_targets, 1), 0) <> 1 then raise exception 'E_HINT_ONE_TARGET'; end if;
    elsif coalesce(array_length(p_targets, 1), 0) > v_max then
      raise exception 'E_TOO_MANY_TARGETS|%', v_max;
    end if;
  end if;

  select t into v_bad from unnest(p_targets) t
    where not exists (select 1 from public.clients c where c.code = t and c.in_game) limit 1;
  if v_bad is not null then raise exception 'E_CLIENT_NOT_IN_GAME|%', v_bad; end if;

  if p_item in ('HINT1', 'HINT2', 'CONSULT') and exists (select 1 from public.purchases
      where team_id = p_team and item = p_item and status = 'approved' and targets = p_targets
        and id is distinct from p_skip) then
    raise exception 'E_ALREADY_BOUGHT';
  end if;
  if p_item = 'HINT2' and not public.team_has_item(p_team, 'HINT1', p_targets[1]) then
    raise exception 'E_HINT2_ORDER';
  end if;

  select coalesce(sum(cost), 0) into v_spent_cat from public.purchases
    where team_id = p_team and category = p_category and status = 'approved' and id is distinct from p_skip;
  v_spent_all := public.team_spent(p_team, s);
  v_cap := public.gs(s, 'cap_' || p_category);
  if v_spent_cat + p_cost > v_cap then
    raise exception 'E_CAT_LIMIT|%|%|%', v_spent_cat, v_cap, p_cost;
  end if;
  if v_spent_all + p_cost > public.gs(s, 'budget') then
    raise exception 'E_BUDGET|%|%|%', v_spent_all, public.gs(s, 'budget'), p_cost;
  end if;
end $$;
revoke all on function public.validate_purchase(uuid, jsonb, text, text, int, text[], bigint, bigint) from public, anon, authenticated;

create or replace function public.create_purchase(
  p_team uuid, p_item text, p_targets text[], p_justification text, p_request bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  v_staff boolean := public.can_manage_team(p_team);
  v_category text;
  v_cost int;
  v_targets text[];
  v_id bigint;
begin
  if not (v_staff or public.is_captain_of(p_team)) then raise exception 'E_NO_RIGHTS_PURCHASE'; end if;
  g := public.lock_team_game(p_team);

  select coalesce(array_agg(distinct upper(trim(t))), '{}') into v_targets
    from unnest(coalesce(p_targets, '{}')) t where trim(t) <> '';

  if p_item = 'REQ' then
    select 'hq', price, case when coalesce(array_length(v_targets, 1), 0) = 0 then targets else v_targets end
      into v_category, v_cost, v_targets
      from public.hq_requests where id = p_request and team_id = p_team;
    if v_category is null then raise exception 'E_REQ_NOT_FOUND'; end if;
    if v_cost is null then raise exception 'E_REQ_NOT_PRICED'; end if;
  else
    select category, cost into v_category, v_cost from public.catalog_items where code = p_item;
    if v_category is null then raise exception 'E_ITEM_NOT_FOUND'; end if;
    p_request := null;
  end if;

  if not v_staff and not (
       (v_category = 'info' and g.phase in ('r1p2', 'r1p3'))
    or (v_category = 'marketing' and g.phase = 'r2p1')
    or (v_category = 'hq' and g.phase = 'r2p2')) then
    raise exception 'E_PHASE_PURCHASE';
  end if;
  if v_category in ('marketing', 'hq') and char_length(trim(coalesce(p_justification, ''))) < 3 then
    raise exception 'E_JUSTIFICATION';
  end if;
  if char_length(coalesce(p_justification, '')) > 1000 then raise exception 'E_JUSTIFICATION_LONG'; end if;

  perform public.validate_purchase(p_team, g.settings, p_item, v_category, v_cost, v_targets, p_request, null);

  insert into public.purchases (team_id, item, request_id, category, cost, targets, justification, status,
                                decided_by, decided_at)
  values (p_team, p_item, p_request, v_category, v_cost, v_targets, trim(coalesce(p_justification, '')),
          'approved', auth.uid(), now())
  returning id into v_id;
  return v_id;
end $$;

-- Механика подтверждения куратором отключена.
drop function if exists public.decide_purchase(bigint, boolean, text);
update public.purchases set status = 'cancelled', note = 'Подтверждение куратором отключено', decided_at = now()
  where status = 'pending';

-- Исправление ошибки организатором: отмена покупки с причиной.
create or replace function public.cancel_purchase(p_id bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.purchases;
begin
  select * into p from public.purchases where id = p_id;
  if p.id is null then raise exception 'E_PURCHASE_NOT_FOUND'; end if;
  if not public.can_manage_team(p.team_id) then raise exception 'E_NO_RIGHTS_CANCEL'; end if;
  perform public.lock_team_game(p.team_id);
  if p.status <> 'approved' then raise exception 'E_ALREADY_CANCELLED'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'E_CANCEL_REASON'; end if;
  if p.item = 'HINT1' and public.team_has_item(p.team_id, 'HINT2', p.targets[1]) then
    raise exception 'E_CANCEL_HINT1_FIRST';
  end if;
  if p.item = 'CONSULT' and exists (select 1 from public.team_kams
      where team_id = p.team_id and specialization = 'other_enterprise') then
    raise exception 'E_CANCEL_CONSULT_SPEC';
  end if;
  update public.purchases set status = 'cancelled', note = left(trim(p_note), 500),
    decided_by = auth.uid(), decided_at = now() where id = p_id;
end $$;

-- ============ Запросы к HQ и встречи: коды ошибок ============
create or replace function public.create_hq_request(p_team uuid, p_title text, p_barrier text, p_targets text[], p_priority int)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  v_id bigint;
begin
  if not (public.can_manage_team(p_team) or public.is_captain_of(p_team)) then raise exception 'E_NO_RIGHTS_REQUEST'; end if;
  g := public.lock_team_game(p_team);
  if not public.can_manage_team(p_team) and g.phase <> 'r2p2' then raise exception 'E_PHASE_REQUEST'; end if;
  if (select count(*) from public.hq_requests where team_id = p_team) >= public.gs(g.settings, 'max_hq_requests') then
    raise exception 'E_REQUEST_MAX|%', public.gs(g.settings, 'max_hq_requests');
  end if;
  insert into public.hq_requests (team_id, title, barrier, targets, priority)
  values (p_team, trim(p_title), trim(coalesce(p_barrier, '')),
          coalesce((select array_agg(distinct upper(trim(t))) from unnest(coalesce(p_targets, '{}')) t where trim(t) <> ''), '{}'),
          coalesce(p_priority, 2))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.price_hq_request(p_id bigint, p_price int)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  select team_id into v_team from public.hq_requests where id = p_id;
  if v_team is null then raise exception 'E_REQ_NOT_FOUND'; end if;
  if not public.can_manage_team(v_team) then raise exception 'E_REQ_PRICE_RIGHTS'; end if;
  if exists (select 1 from public.purchases where request_id = p_id and status in ('pending', 'approved')) then
    raise exception 'E_REQ_PRICE_BOUGHT';
  end if;
  update public.hq_requests set price = p_price where id = p_id;
end $$;

create or replace function public.delete_hq_request(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  select team_id into v_team from public.hq_requests where id = p_id;
  if v_team is null then raise exception 'E_REQ_NOT_FOUND'; end if;
  if not (public.can_manage_team(v_team) or public.is_captain_of(v_team)) then raise exception 'E_NO_RIGHTS'; end if;
  if exists (select 1 from public.purchases where request_id = p_id and status in ('pending', 'approved')) then
    raise exception 'E_REQ_BOUGHT';
  end if;
  delete from public.hq_requests where id = p_id;
end $$;

create or replace function public.set_meeting_result(
  p_team uuid, p_client text, p_outcome text, p_amount int, p_strength text, p_improvement text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_team(p_team) then raise exception 'E_MEETING_RIGHTS'; end if;
  perform public.lock_team_game(p_team);
  if p_outcome is null then
    delete from public.meeting_results where team_id = p_team and client_code = p_client;
    return;
  end if;
  insert into public.meeting_results (team_id, client_code, outcome, amount, strength, improvement, updated_by, updated_at)
  values (p_team, upper(p_client), p_outcome, greatest(coalesce(p_amount, 0), 0),
          left(coalesce(p_strength, ''), 500), left(coalesce(p_improvement, ''), 500), auth.uid(), now())
  on conflict (team_id, client_code) do update
    set outcome = excluded.outcome, amount = excluded.amount, strength = excluded.strength,
        improvement = excluded.improvement, updated_by = auth.uid(), updated_at = now();
end $$;

-- Старые настройки Sales Capacity больше не используются.
update public.games set settings = settings - 'capacity' - 'cost_active' - 'cost_maintenance'
  where settings ?| array['capacity', 'cost_active', 'cost_maintenance'];
