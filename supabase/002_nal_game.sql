-- NAL Games: раунды, доска команды, покупки, куратор. Выполнять целиком в SQL Editor после schema.sql.
-- Скрипт идемпотентный: его можно запускать повторно, справочники обновятся.

-- ============ Роль куратора ============
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('superadmin', 'captain', 'member', 'curator'));

-- ============ Раунды и настройки игры ============
alter table public.games add column if not exists phase text not null default 'lobby';
alter table public.games add column if not exists phase_ends_at timestamptz;
alter table public.games add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.games drop constraint if exists games_phase_check;
alter table public.games add constraint games_phase_check
  check (phase in ('lobby', 'r1p1', 'r1p2', 'r1p3', 'r2p1', 'r2p2', 'r3', 'r4', 'r5', 'finished'));

-- Значение настройки игры с запасным значением по умолчанию.
create or replace function public.gs(p_settings jsonb, p_key text)
returns numeric language sql immutable as $$
  select coalesce((p_settings ->> p_key)::numeric, (jsonb_build_object(
    'budget', 80, 'cap_info', 10, 'cap_marketing', 20, 'cap_hq', 25,
    'capacity', 170, 'cost_active', 10, 'cost_maintenance', 2.5, 'cost_spec', 8,
    'kams', 4, 'max_active_per_kam', 4, 'max_maint_per_kam', 1,
    'ssm_count', 2, 'ssm_max_clients', 4, 'max_specs', 3, 'max_hq_requests', 3
  ) ->> p_key)::numeric);
$$;

-- ============ Справочники ============
create table if not exists public.clients (
  code text primary key,
  name text not null,
  industry text not null,
  business text not null,
  employees text not null,
  kl_related text not null,
  extra text,
  sort int not null default 0,
  in_game boolean not null default true
);

create table if not exists public.client_hints (
  client_code text not null references public.clients(code) on delete cascade,
  level smallint not null check (level in (1, 2)),
  body text not null,
  primary key (client_code, level)
);

-- Позиции, которые продаёт куратор: подсказки, консультация, маркетинг, HQ.
create table if not exists public.catalog_items (
  code text primary key,
  category text not null check (category in ('info', 'marketing', 'hq')),
  name text not null,
  cost int not null check (cost >= 0),
  max_targets int not null default 0,   -- 0 = без целевых клиентов
  leads int not null default 0,
  description text not null default '',
  sort int not null default 0
);

-- Закрытая часть каталога: скрытые эффекты и условия совпадения (только админ и кураторы).
create table if not exists public.catalog_secrets (
  code text primary key references public.catalog_items(code) on delete cascade,
  note text not null
);

-- ============ Состояние команды ============
create table if not exists public.placements (
  team_id uuid not null references public.teams(id) on delete cascade,
  client_code text not null references public.clients(code) on delete cascade,
  bucket text not null check (bucket in ('active', 'maintenance', 'midmarket')),
  kam smallint,
  ssm smallint,
  updated_at timestamptz not null default now(),
  primary key (team_id, client_code),
  check ((bucket = 'midmarket' and kam is null) or (bucket <> 'midmarket' and kam is not null)),
  check (ssm is null or bucket = 'active')
);

create table if not exists public.team_kams (
  team_id uuid not null references public.teams(id) on delete cascade,
  kam smallint not null,
  specialization text check (specialization in ('government', 'industrial', 'finance', 'telecom', 'other_enterprise')),
  primary key (team_id, kam)
);

create table if not exists public.hq_requests (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  barrier text not null default '' check (char_length(barrier) <= 1000),
  targets text[] not null default '{}',
  priority smallint not null default 2 check (priority between 1 and 3),
  price int check (price is null or price between 0 and 25),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  item text not null,                    -- код из catalog_items или 'REQ' (запрос вне каталога)
  request_id bigint references public.hq_requests(id) on delete set null,
  category text not null check (category in ('info', 'marketing', 'hq')),
  cost int not null,
  targets text[] not null default '{}',
  justification text not null default '',
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text not null default '',
  requested_by uuid default auth.uid(),
  decided_by uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists purchases_team_idx on public.purchases (team_id, status);

create table if not exists public.meeting_results (
  team_id uuid not null references public.teams(id) on delete cascade,
  client_code text not null references public.clients(code) on delete cascade,
  outcome text not null check (outcome in ('no_progress', 'qualified', 'strategic')),
  amount int not null default 0 check (amount >= 0),
  strength text not null default '',
  improvement text not null default '',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (team_id, client_code)
);

-- ============ Хелперы доступа ============
create or replace function public.my_team()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('superadmin', 'curator'));
$$;

-- Куратор этого стола или супер-админ.
create or replace function public.can_manage_team(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'curator' and team_id = p_team);
$$;

create or replace function public.can_view_team(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or (p_team is not null and p_team = public.my_team());
$$;

create or replace function public.is_captain_of(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'captain' and team_id = p_team);
$$;

create or replace function public.team_has_item(p_team uuid, p_item text, p_client text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.purchases
    where team_id = p_team and item = p_item and status = 'approved'
      and (p_client is null or p_client = any (targets)));
$$;

-- Игра команды с блокировкой строки команды: сериализует изменения одного стола.
create or replace function public.lock_team_game(p_team uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  perform 1 from public.teams where id = p_team for update;
  select gm.* into g from public.teams t join public.games gm on gm.id = t.game_id where t.id = p_team;
  if g.id is null then raise exception 'Команда не найдена'; end if;
  if not g.is_active then raise exception 'Игра этой команды уже завершена'; end if;
  return g;
end $$;

create or replace function public.capacity_used(p_team uuid, p_settings jsonb, p_skip_client text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(case bucket
      when 'active' then public.gs(p_settings, 'cost_active')
      when 'maintenance' then public.gs(p_settings, 'cost_maintenance')
      else 0 end)
    from public.placements where team_id = p_team and client_code is distinct from p_skip_client), 0)
  + (select count(*) from public.team_kams where team_id = p_team and specialization is not null)
    * public.gs(p_settings, 'cost_spec');
$$;

revoke all on function public.lock_team_game(uuid) from public, anon, authenticated;
revoke all on function public.capacity_used(uuid, jsonb, text) from public, anon, authenticated;

-- ============ Доска: размещение клиента ============
create or replace function public.set_placement(p_team uuid, p_client text, p_bucket text, p_kam int, p_ssm int)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  s jsonb;
  v_cost numeric;
begin
  if not (public.can_manage_team(p_team) or public.is_captain_of(p_team)) then
    raise exception 'Менять доску может только капитан или куратор стола';
  end if;
  g := public.lock_team_game(p_team);
  s := g.settings;
  if not public.can_manage_team(p_team)
     and g.phase not in ('r1p1', 'r1p2', 'r1p3', 'r2p1', 'r2p2', 'r3', 'r4') then
    raise exception 'В этом раунде распределение менять нельзя';
  end if;
  if not exists (select 1 from public.clients where code = p_client and in_game) then
    raise exception 'Клиент % не участвует в игре', p_client;
  end if;

  if p_bucket is null or p_bucket = 'pool' then
    delete from public.placements where team_id = p_team and client_code = p_client;
    return;
  end if;
  if p_bucket not in ('active', 'maintenance', 'midmarket') then raise exception 'Неизвестная кучка'; end if;
  if p_bucket = 'midmarket' then p_kam := null; end if;
  if p_bucket <> 'active' then p_ssm := null; end if;
  if p_bucket <> 'midmarket' and (p_kam is null or p_kam < 1 or p_kam > public.gs(s, 'kams')) then
    raise exception 'Укажите KAM';
  end if;
  if p_ssm is not null and (p_ssm < 1 or p_ssm > public.gs(s, 'ssm_count')) then
    raise exception 'Нет такого SSM';
  end if;

  if p_bucket = 'active' and (select count(*) from public.placements
      where team_id = p_team and bucket = 'active' and kam = p_kam and client_code <> p_client)
      >= public.gs(s, 'max_active_per_kam') then
    raise exception 'У KAM % уже максимум Active-клиентов (%)', p_kam, public.gs(s, 'max_active_per_kam');
  end if;
  if p_bucket = 'maintenance' and (select count(*) from public.placements
      where team_id = p_team and bucket = 'maintenance' and kam = p_kam and client_code <> p_client)
      >= public.gs(s, 'max_maint_per_kam') then
    raise exception 'У KAM % уже максимум клиентов на Maintenance (%)', p_kam, public.gs(s, 'max_maint_per_kam');
  end if;
  if p_ssm is not null and (select count(*) from public.placements
      where team_id = p_team and ssm = p_ssm and client_code <> p_client) >= public.gs(s, 'ssm_max_clients') then
    raise exception 'У SSM % уже максимум клиентов (%)', p_ssm, public.gs(s, 'ssm_max_clients');
  end if;

  v_cost := case p_bucket when 'active' then public.gs(s, 'cost_active')
                          when 'maintenance' then public.gs(s, 'cost_maintenance') else 0 end;
  if public.capacity_used(p_team, s, p_client) + v_cost > public.gs(s, 'capacity') then
    raise exception 'Не хватает Sales Capacity: нужно %, свободно %', v_cost,
      public.gs(s, 'capacity') - public.capacity_used(p_team, s, p_client);
  end if;

  insert into public.placements (team_id, client_code, bucket, kam, ssm, updated_at)
  values (p_team, p_client, p_bucket, p_kam, p_ssm, now())
  on conflict (team_id, client_code) do update
    set bucket = excluded.bucket, kam = excluded.kam, ssm = excluded.ssm, updated_at = now();
end $$;

-- ============ Специализация KAM (стоит Sales Capacity) ============
create or replace function public.set_kam_spec(p_team uuid, p_kam int, p_spec text)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  s jsonb;
  v_old text;
begin
  if not (public.can_manage_team(p_team) or public.is_captain_of(p_team)) then
    raise exception 'Специализацию выбирает капитан или куратор стола';
  end if;
  g := public.lock_team_game(p_team);
  s := g.settings;
  if not public.can_manage_team(p_team) and g.phase <> 'r1p3' then
    raise exception 'Специализации выбираются в Round 1 Part 3';
  end if;
  if p_kam is null or p_kam < 1 or p_kam > public.gs(s, 'kams') then raise exception 'Нет такого KAM'; end if;
  if p_spec is not null and p_spec not in ('government', 'industrial', 'finance', 'telecom', 'other_enterprise') then
    raise exception 'Неизвестная специализация';
  end if;
  if p_spec = 'other_enterprise' and not public.team_has_item(p_team, 'CONSULT', null) then
    raise exception 'Это направление пока недоступно';
  end if;

  select specialization into v_old from public.team_kams where team_id = p_team and kam = p_kam;
  if p_spec is not distinct from v_old then return; end if;

  if p_spec is not null then
    if exists (select 1 from public.team_kams where team_id = p_team and kam <> p_kam and specialization = p_spec) then
      raise exception 'Эта специализация уже есть у другого KAM';
    end if;
    if v_old is null then
      if (select count(*) from public.team_kams where team_id = p_team and specialization is not null)
         >= public.gs(s, 'max_specs') then
        raise exception 'Не больше % специализаций на команду', public.gs(s, 'max_specs');
      end if;
      if public.capacity_used(p_team, s, null) + public.gs(s, 'cost_spec') > public.gs(s, 'capacity') then
        raise exception 'Не хватает Sales Capacity на обучение: нужно %, свободно %', public.gs(s, 'cost_spec'),
          public.gs(s, 'capacity') - public.capacity_used(p_team, s, null);
      end if;
    end if;
  end if;

  insert into public.team_kams (team_id, kam, specialization) values (p_team, p_kam, p_spec)
  on conflict (team_id, kam) do update set specialization = excluded.specialization;
end $$;

-- ============ Покупки ============
-- Общая проверка покупки; бросает исключение с понятным текстом.
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
    if p_request is null then raise exception 'Не указан запрос к HQ'; end if;
    if exists (select 1 from public.purchases where request_id = p_request and status in ('pending', 'approved')
               and id is distinct from p_skip) then
      raise exception 'Этот запрос уже куплен';
    end if;
  else
    select max_targets into v_max from public.catalog_items where code = p_item;
    if p_item in ('HINT1', 'HINT2') then
      if coalesce(array_length(p_targets, 1), 0) <> 1 then raise exception 'Подсказка покупается на одного клиента'; end if;
    elsif coalesce(array_length(p_targets, 1), 0) > v_max then
      raise exception 'Слишком много целевых клиентов: максимум %', v_max;
    end if;
  end if;

  select t into v_bad from unnest(p_targets) t
    where not exists (select 1 from public.clients c where c.code = t and c.in_game) limit 1;
  if v_bad is not null then raise exception 'Клиент % не участвует в игре', v_bad; end if;

  if p_item in ('HINT1', 'HINT2', 'CONSULT') and exists (select 1 from public.purchases
      where team_id = p_team and item = p_item and status = 'approved' and targets = p_targets
        and id is distinct from p_skip) then
    raise exception 'Это уже куплено';
  end if;
  if p_item = 'HINT2' and not public.team_has_item(p_team, 'HINT1', p_targets[1]) then
    raise exception 'Hint 2 покупается только после Hint 1';
  end if;

  select coalesce(sum(cost), 0) into v_spent_cat from public.purchases
    where team_id = p_team and category = p_category and status = 'approved' and id is distinct from p_skip;
  select coalesce(sum(cost), 0) into v_spent_all from public.purchases
    where team_id = p_team and status = 'approved' and id is distinct from p_skip;
  v_cap := public.gs(s, 'cap_' || p_category);
  if v_spent_cat + p_cost > v_cap then
    raise exception 'Превышен лимит категории: потрачено %, лимит %, покупка %', v_spent_cat, v_cap, p_cost;
  end if;
  if v_spent_all + p_cost > public.gs(s, 'budget') then
    raise exception 'Превышен общий бюджет: потрачено %, бюджет %, покупка %', v_spent_all, public.gs(s, 'budget'), p_cost;
  end if;
end $$;
revoke all on function public.validate_purchase(uuid, jsonb, text, text, int, text[], bigint, bigint) from public, anon, authenticated;

-- Капитан создаёт заявку (pending), куратор и админ — сразу проводят покупку.
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
  if not (v_staff or public.is_captain_of(p_team)) then
    raise exception 'Покупки оформляет капитан или куратор стола';
  end if;
  g := public.lock_team_game(p_team);

  select coalesce(array_agg(distinct upper(trim(t))), '{}') into v_targets
    from unnest(coalesce(p_targets, '{}')) t where trim(t) <> '';

  if p_item = 'REQ' then
    select 'hq', price, case when coalesce(array_length(v_targets, 1), 0) = 0 then targets else v_targets end
      into v_category, v_cost, v_targets
      from public.hq_requests where id = p_request and team_id = p_team;
    if v_category is null then raise exception 'Запрос к HQ не найден'; end if;
    if v_cost is null then raise exception 'Организаторы ещё не оценили этот запрос'; end if;
  else
    select category, cost into v_category, v_cost from public.catalog_items where code = p_item;
    if v_category is null then raise exception 'Нет такой позиции'; end if;
    p_request := null;
  end if;

  if not v_staff and not (
       (v_category = 'info' and g.phase in ('r1p2', 'r1p3'))
    or (v_category = 'marketing' and g.phase = 'r2p1')
    or (v_category = 'hq' and g.phase = 'r2p2')) then
    raise exception 'Эта покупка недоступна в текущем раунде';
  end if;
  if v_category in ('marketing', 'hq') and char_length(trim(coalesce(p_justification, ''))) < 3 then
    raise exception 'Укажите обоснование: какой барьер снимает покупка';
  end if;
  if char_length(coalesce(p_justification, '')) > 1000 then raise exception 'Обоснование слишком длинное'; end if;

  perform public.validate_purchase(p_team, g.settings, p_item, v_category, v_cost, v_targets, p_request, null);

  insert into public.purchases (team_id, item, request_id, category, cost, targets, justification, status,
                                decided_by, decided_at)
  values (p_team, p_item, p_request, v_category, v_cost, v_targets, trim(coalesce(p_justification, '')),
          case when v_staff then 'approved' else 'pending' end,
          case when v_staff then auth.uid() end, case when v_staff then now() end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.decide_purchase(p_id bigint, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.purchases;
  g public.games;
begin
  select * into p from public.purchases where id = p_id;
  if p.id is null then raise exception 'Покупка не найдена'; end if;
  if not public.can_manage_team(p.team_id) then raise exception 'Решение принимает куратор стола'; end if;
  g := public.lock_team_game(p.team_id);
  select * into p from public.purchases where id = p_id;
  if p.status <> 'pending' then raise exception 'Заявка уже обработана'; end if;
  if p_approve then
    perform public.validate_purchase(p.team_id, g.settings, p.item, p.category, p.cost, p.targets, p.request_id, p.id);
  end if;
  update public.purchases
    set status = case when p_approve then 'approved' else 'rejected' end,
        note = left(coalesce(p_note, ''), 500), decided_by = auth.uid(), decided_at = now()
    where id = p_id;
end $$;

-- Исправление ошибки куратором: отмена проведённой покупки с причиной.
create or replace function public.cancel_purchase(p_id bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.purchases;
begin
  select * into p from public.purchases where id = p_id;
  if p.id is null then raise exception 'Покупка не найдена'; end if;
  if not public.can_manage_team(p.team_id) then raise exception 'Отменять покупки может только куратор стола'; end if;
  perform public.lock_team_game(p.team_id);
  if p.status not in ('approved', 'pending') then raise exception 'Покупка уже отменена'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Укажите причину отмены'; end if;
  if p.item = 'HINT1' and public.team_has_item(p.team_id, 'HINT2', p.targets[1]) then
    raise exception 'Сначала отмените Hint 2 по этому клиенту';
  end if;
  if p.item = 'CONSULT' and exists (select 1 from public.team_kams
      where team_id = p.team_id and specialization = 'other_enterprise') then
    raise exception 'Сначала снимите специализацию Other Enterprise';
  end if;
  update public.purchases set status = 'cancelled', note = left(trim(p_note), 500),
    decided_by = auth.uid(), decided_at = now() where id = p_id;
end $$;

-- ============ Запросы к HQ вне каталога ============
create or replace function public.create_hq_request(p_team uuid, p_title text, p_barrier text, p_targets text[], p_priority int)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  v_id bigint;
begin
  if not (public.can_manage_team(p_team) or public.is_captain_of(p_team)) then
    raise exception 'Запрос создаёт капитан или куратор стола';
  end if;
  g := public.lock_team_game(p_team);
  if not public.can_manage_team(p_team) and g.phase <> 'r2p2' then
    raise exception 'Запросы к HQ создаются в Round 2 Part 2';
  end if;
  if (select count(*) from public.hq_requests where team_id = p_team) >= public.gs(g.settings, 'max_hq_requests') then
    raise exception 'Не больше % запросов к HQ на команду', public.gs(g.settings, 'max_hq_requests');
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
  if v_team is null then raise exception 'Запрос не найден'; end if;
  if not public.can_manage_team(v_team) then raise exception 'Цену ставят организаторы'; end if;
  if exists (select 1 from public.purchases where request_id = p_id and status in ('pending', 'approved')) then
    raise exception 'Запрос уже куплен, цену менять нельзя';
  end if;
  update public.hq_requests set price = p_price where id = p_id;
end $$;

create or replace function public.delete_hq_request(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  select team_id into v_team from public.hq_requests where id = p_id;
  if v_team is null then raise exception 'Запрос не найден'; end if;
  if not (public.can_manage_team(v_team) or public.is_captain_of(v_team)) then raise exception 'Нет прав'; end if;
  if exists (select 1 from public.purchases where request_id = p_id and status in ('pending', 'approved')) then
    raise exception 'Запрос уже куплен';
  end if;
  delete from public.hq_requests where id = p_id;
end $$;

-- ============ Раунд 3: результат встречи ============
create or replace function public.set_meeting_result(
  p_team uuid, p_client text, p_outcome text, p_amount int, p_strength text, p_improvement text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_team(p_team) then raise exception 'Результат встречи вносит куратор стола'; end if;
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

do $$
declare f text;
begin
  foreach f in array array[
    'set_placement(uuid, text, text, int, int)', 'set_kam_spec(uuid, int, text)',
    'create_purchase(uuid, text, text[], text, bigint)', 'decide_purchase(bigint, boolean, text)',
    'cancel_purchase(bigint, text)', 'create_hq_request(uuid, text, text, text[], int)',
    'price_hq_request(bigint, int)', 'delete_hq_request(bigint)',
    'set_meeting_result(uuid, text, text, int, text, text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Разделить поровну: кураторов не трогаем, они закреплены за столом вручную.
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
  for r in select id from public.profiles where game_id = v_game and role in ('member', 'captain') order by random() loop
    update public.profiles set team_id = v_teams[(v_i % v_n) + 1] where id = r.id;
    v_i := v_i + 1;
  end loop;
  perform public.write_audit(auth.uid(), v_game, 'split_evenly', 'game', v_game::text,
    jsonb_build_object('participants', v_i, 'teams', v_n));
end $$;

-- ============ Аудит ============
create or replace function public.audit_nal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_team uuid := (v_row ->> 'team_id')::uuid;
  v_game uuid := (select game_id from public.teams where id = v_team);
  v_action text;
  v_details jsonb;
begin
  if tg_table_name = 'placements' then
    v_action := case tg_op when 'DELETE' then 'placement_removed' else 'placement_set' end;
    v_details := jsonb_build_object('client', v_row ->> 'client_code', 'bucket', v_row ->> 'bucket',
      'kam', v_row -> 'kam', 'ssm', v_row -> 'ssm');
  elsif tg_table_name = 'team_kams' then
    v_action := 'kam_spec_set';
    v_details := jsonb_build_object('kam', v_row -> 'kam', 'spec', v_row ->> 'specialization');
  elsif tg_table_name = 'purchases' then
    v_action := 'purchase_' || (v_row ->> 'status');
    v_details := jsonb_build_object('item', v_row ->> 'item', 'cost', v_row -> 'cost',
      'targets', v_row -> 'targets', 'note', v_row ->> 'note');
  elsif tg_table_name = 'hq_requests' then
    v_action := case tg_op when 'INSERT' then 'hq_request_created' when 'DELETE' then 'hq_request_deleted'
                           else 'hq_request_priced' end;
    v_details := jsonb_build_object('title', v_row ->> 'title', 'price', v_row -> 'price');
  elsif tg_table_name = 'meeting_results' then
    v_action := case tg_op when 'DELETE' then 'meeting_removed' else 'meeting_set' end;
    v_details := jsonb_build_object('client', v_row ->> 'client_code', 'outcome', v_row ->> 'outcome',
      'amount', v_row -> 'amount');
  end if;
  perform public.write_audit(auth.uid(), v_game, v_action, tg_table_name, v_team::text,
    v_details || jsonb_build_object('team', (select name from public.teams where id = v_team)));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['placements', 'team_kams', 'purchases', 'hq_requests', 'meeting_results'] loop
    execute format('drop trigger if exists trg_audit_nal on public.%I', t);
    execute format('create trigger trg_audit_nal after insert or update or delete on public.%I
                    for each row execute function public.audit_nal()', t);
  end loop;
end $$;

create or replace function public.audit_games()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(auth.uid(), new.id, 'game_created', 'game', new.id::text, jsonb_build_object('name', new.name));
    return new;
  end if;
  if new.is_active is distinct from old.is_active then
    perform public.write_audit(auth.uid(), new.id, case when new.is_active then 'game_activated' else 'game_finished' end,
      'game', new.id::text, jsonb_build_object('name', new.name));
  end if;
  if new.phase is distinct from old.phase then
    perform public.write_audit(auth.uid(), new.id, 'phase_changed', 'game', new.id::text,
      jsonb_build_object('from', old.phase, 'to', new.phase, 'ends_at', new.phase_ends_at));
  end if;
  if new.settings is distinct from old.settings then
    perform public.write_audit(auth.uid(), new.id, 'settings_changed', 'game', new.id::text,
      jsonb_build_object('from', old.settings, 'to', new.settings));
  end if;
  return new;
end $$;

-- ============ RLS ============
alter table public.clients enable row level security;
alter table public.client_hints enable row level security;
alter table public.catalog_items enable row level security;
alter table public.catalog_secrets enable row level security;
alter table public.placements enable row level security;
alter table public.team_kams enable row level security;
alter table public.hq_requests enable row level security;
alter table public.purchases enable row level security;
alter table public.meeting_results enable row level security;

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (true);
drop policy if exists clients_admin_write on public.clients;
create policy clients_admin_write on public.clients for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Подсказку видят организаторы и команда, которая её купила.
drop policy if exists hints_select on public.client_hints;
create policy hints_select on public.client_hints for select to authenticated using (
  public.is_staff() or public.team_has_item(public.my_team(), 'HINT' || level, client_code));

drop policy if exists catalog_select on public.catalog_items;
create policy catalog_select on public.catalog_items for select to authenticated using (true);

drop policy if exists secrets_select on public.catalog_secrets;
create policy secrets_select on public.catalog_secrets for select to authenticated using (
  public.is_staff() or (code = 'CONSULT' and public.team_has_item(public.my_team(), 'CONSULT', null)));

-- Состояние стола видят его участники, куратор и супер-админ. Запись только через RPC.
do $$
declare t text;
begin
  foreach t in array array['placements', 'team_kams', 'hq_requests', 'purchases', 'meeting_results'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_view_team(team_id))',
                   t || '_select', t);
  end loop;
end $$;

-- ============ Realtime ============
do $$
declare t text;
begin
  foreach t in array array['games', 'placements', 'team_kams', 'hq_requests', 'purchases', 'meeting_results'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============ Справочник клиентов (карточки + подсказки) ============
insert into public.clients (code, name, industry, business, employees, kl_related, extra, sort) values
('G1', 'Ministry of Digital Development', 'Government', 'Responsible for national digital-government programs, shared government IT platforms and the development of public digital services.', '1,000', 'Endpoint. Renewal ~$10K', null, 1),
('G2', 'Ministry of Education & Public Learning', 'Government', 'Sets national education policy and oversees a large network of regional education authorities, public schools, universities and affiliated institutions.', '40,000', 'Endpoint only. Renewal ~$40K', null, 2),
('G3', 'National Land Forces', 'Government / Security', 'Operates secure information, communication and analytical systems supporting national security and law-enforcement functions.', '8,500', 'New logo', null, 3),
('G4', 'Regional Emergency Services Network', 'Government / Emergency Services', 'Provides emergency communication, dispatch and coordination systems for public safety organizations across several major regions.', '1,850', 'Endpoint only. Renewal ~$38K', null, 4),
('B1', 'Northstar Bank', 'Banking', 'One of the country''s largest banks. Operates a mature SOC team and a large digital banking platform serving more than 5 million customers.', '15,000', 'New logo', null, 5),
('B2', 'BrightSun Bank', 'Banking', 'One of top 3 banks in the Country. Operates a mature SOC team and a large digital banking platform serving more than 5 million customers.', '13,000', 'New logo', null, 6),
('B3', 'Central Bank', 'Banking', 'Operates the country''s core payment, settlement and monetary systems, supervises major financial institutions and maintains critical national financial infrastructure.', '20,000', 'EPP+Hybrid, Renewal $35K', null, 7),
('B4', 'NovaSpace Development Bank', 'Banking', 'One of the oldest banks in the country. Operates a network of 50 branches and offers standard retail banking, lending and digital payment services.', '2,000', 'EPP, Renewal $25K', null, 8),
('T1', 'TCom Group', 'Telecom', 'Nationwide fixed and mobile telecommunications operator serving consumers, enterprises and public-sector organizations. State-controlled through a public investment holding.', '10,000', '2 products. Renewal ~$30K', null, 9),
('T2', 'Helios Telecom', 'Telecom', 'One of the country''s largest mobile and fixed-line operators, serving more than 18 million subscribers. Operates its own 24/7 SOC and nationwide communications infrastructure.', '17,500', '1 product. Renewal ~$40K', null, 10),
('E1', 'GridCore Energy', 'Energy', 'Operates the country''s high-voltage transmission grid and power-dispatching infrastructure. Majority-owned by a public infrastructure holding.', '8,000', '2 products. Renewal ~$40K', null, 11),
('E2', 'AquaSphere Infrastructure', 'Utilities', 'Operates large water-treatment facilities, pumping stations and regional distribution networks serving several major cities.', '12,500', '1 product. Renewal ~$30K', null, 12),
('E3', 'TerraNova Mining Group', 'Mining / Industrial', 'Operates several large mining and mineral-processing sites across the country. Runs both enterprise IT and complex industrial environments supported by a centralized security operations team.', '21,000', 'New logo', null, 13),
('E4', 'BlueRiver Energy', 'Energy', 'Major electricity generation company operating power plants and energy infrastructure across several regions. Maintains dedicated IT and OT security teams and a mature SOC.', '2,700', 'EPP Renewal $20K', null, 14),
('E5', 'Metro Water Services', 'Utilities', 'Operates water-treatment and distribution infrastructure for a large metropolitan area, including pumping stations and operational control systems.', '1,600', 'EPP. Renewal ~$15K', null, 15),
('H1', 'MedCore Health Network', 'Healthcare', 'Operates a large network of hospitals, shared medical systems and centralized healthcare data services. Most of its funding comes from public healthcare programs.', '22,000', 'New logo', null, 16),
('H2', 'Meridian Health Group', 'Healthcare', 'The country''s largest private healthcare network, operating hospitals, laboratories, diagnostic centers and centralized digital health services. Maintains a dedicated cybersecurity team and 24/7 monitoring capability.', '18,000', 'New logo', null, 17),
('R1', 'Continental Rail Systems', 'Transport', 'Operates most of the country''s railway infrastructure, passenger services and major freight corridors under a long-term public infrastructure mandate.', '68,000', 'Endpoint only. Renewal ~$50K', null, 18),
('R2', 'SkyRoute Services', 'Transport / Aviation', 'Provides air-navigation, aviation communications and air-traffic-management technology for commercial airports and airlines.', '4,800', 'New logo', null, 19),
('C1', 'GrandMart Retail Group', 'Retail', 'The country''s largest food and general merchandise retailer, operating more than 900 stores, several logistics centers and a major e-commerce platform. Runs a mature internal SOC.', '17,000', 'EPP. Renewal ~$10K', null, 20),
('A1', 'Crown Automotive Group', 'Automotive / Manufacturing', 'One of the country''s largest automotive manufacturers, operating vehicle assembly plants, component facilities and a large dealer network. Maintains dedicated IT and OT security teams.', '24,000', '2 products. Renewal ~$45K', null, 21),
('O1', 'Aurora Insurance Group', 'Insurance', 'Well-known insurance company offering retail, motor, health insurance through branches and digital channels.', '2,000', '2 products. Renewal ~$25K', null, 22),
('F1', 'Apex Payments Network', 'Financial Services / Payments', 'One of the country''s largest private payment-processing companies, providing card processing, digital payments and transaction services to banks, retailers and online businesses. Operates a mature 24/7 SOC and fraud-monitoring center.', '6,500', '2 products. Renewal ~$40K', null, 23),
('D1', 'CloudWorks Digital Group', 'IT / Digital Services', 'Operates large cloud, managed-infrastructure and digital-platform services for enterprise customers across the country. Runs a mature regional SOC and multiple security engineering teams.', '8,400', '1 product. Renewal ~$120K', null, 24),
('Z1', 'Giga Pharma Distribution', 'Healthcare / Pharmaceutical Distribution', 'Large distributor of pharmaceuticals, medical devices and laboratory products, supplying hospitals, pharmacies and private healthcare providers nationwide.', '2,000', 'New logo', '2027 Budget: approximately $1.9 million total IT budget', 25),
('Z2', 'ForgeLine Components', 'Industrial / Manufacturing', 'Manufactures automotive and industrial components across three regional plants and supplies several large domestic and international manufacturers.', '1,000', 'Endpoint only. Renewal ~$30K', null, 26)
on conflict (code) do update set name = excluded.name, industry = excluded.industry, business = excluded.business,
  employees = excluded.employees, kl_related = excluded.kl_related, extra = excluded.extra, sort = excluded.sort;

insert into public.client_hints (client_code, level, body) values
('G1', 1, 'The Ministry plans a sovereign SOC deployed fully on-premises. An initial $100,000 project has funding and local decision authority.'),
('G1', 2, 'The Minister has approved a national cybersecurity program with up to $1 million in first-year procurement. Access to peer government leaders and solution expertise are required to develop the wider scope.'),
('G2', 1, 'Only 450 people work at central HQ. Regional schools and universities have separate IT teams and budgets. The Ministry cannot purchase one national security platform on their behalf.'),
('G2', 2, 'The central office needs standard endpoint, managed detection and awareness products. There is no funded centralized SOC program. A partner can deliver a three-year standard-products agreement.'),
('G3', 1, 'All core security systems must operate fully on-premises. Public cloud use is prohibited. The organization controls its own vendor selection.'),
('G3', 2, 'A funded endpoint, network and detection modernization is planned within 12 months. Procurement requires a documented software-component inventory, component updates and vulnerability-response process.'),
('G4', 1, 'The network has a limited security budget and no major transformation program for 2027.'),
('G4', 2, 'A certified regional partner handles most purchases but needs training to position standard email and vulnerability-management products.'),
('B1', 1, 'A $300,000 SOC refresh is planned next year, but the account is a subsidiary of an international banking group.'),
('B1', 2, 'Foreign Group HQ has already chosen the global security-platform supplier. The local SOC may buy independent incl digital-footprint reports outside that agreement $100,000.'),
('B2', 1, 'The bank is government-funded and finances strategic infrastructure. Sensitive data must remain local, and local management chooses cybersecurity vendors.'),
('B2', 2, 'Critical digital services are moving to Kubernetes. The CISO wants candid feedback from other banks at a closed dinner and needs a solution expert to qualify container security.'),
('B3', 1, 'Modernization procurement requires a clear mapping from critical-infrastructure requirements to security controls and the proposed architecture.'),
('B3', 2, 'The CISO will attend a closed discussion with other critical-infrastructure leaders about sovereign operations and local deployment. The CISO can introduce vendors to other banks.'),
('B4', 1, 'The small SOC has no major platform transformation planned for 2027 or 2028.'),
('B4', 2, 'A trusted partner has identified Email Security and Vulnerability Management needs but lacks product expertise to sell them.'),
('T1', 1, 'The operator is critical infrastructure. Core-network security telemetry must remain in Megaland, and vendor selection is local.'),
('T1', 2, 'Two incumbent contracts expire next year. The team is evaluating container security but cannot distinguish competing offers or estimate migration risks.'),
('T2', 1, 'Group HQ abroad controls enterprise architecture, approved vendors and strategic platform purchasing.'),
('T2', 2, 'The local SOC cannot change the platform stack but controls a modest independent TI budget of $60,000. Procurement wants a short technical validation before committing.'),
('E1', 1, 'Grid control and dispatch are critical infrastructure with isolated OT segments and local purchasing authority.'),
('E1', 2, 'The board risk committee requires an executive discussion about production continuity before expanding the architecture shortlist.'),
('E2', 1, 'A public infrastructure fund controls the utility. Critical OT systems have a proposed $150,000 modernization program, but only a smaller first-year rollout is ready.'),
('E2', 2, 'The finance committee is comparing an offline on-premises rollout with managed alternatives and needs a five-year total cost of ownership model.'),
('E3', 1, 'The group standardized its core security stack on a competitor for three years. Broad replacement initially appears unlikely.'),
('E3', 2, 'A ransomware incident halted production. Management approved $250,000 for emergency remediation but requires a safe simulation demonstrating improved detection and response.'),
('E4', 1, 'The international holding determines the enterprise security stack and vendor list. Endpoint renewal is $20,000.'),
('E4', 2, 'Local plant teams control OT budgets, but require a seller with industrial expertise and proof from comparable plant deployments.'),
('E5', 1, 'The account has a small security team and standardized purchasing patterns despite operating some critical systems.'),
('E5', 2, 'Only a few small standard-product opportunities are funded. A regional partner can deliver a three-year standard-products agreement.'),
('H1', 1, 'Clinical data must remain local. Shared medical platforms are publicly funded, locally operated and designated nationally critical services.'),
('H1', 2, 'Three platforms will be reviewed next year. The investment committee requires a quantified three-year business case before approving the larger scope.'),
('H2', 1, 'The core stack is committed to a competitor for two years. No broad replacement budget is available.'),
('H2', 2, 'The local SOC can buy independent TI for $90,000. The CISO requires peer evidence from another private hospital network before approving the purchase.'),
('R1', 1, 'Rail-control and operations are critical infrastructure. Core workloads have cloud restrictions and local decision authority.'),
('R1', 2, 'A funded SOC modernization includes OT segmentation. Architecture teams require evidence from comparable rail or industrial deployments before extending the project scope.'),
('R2', 1, 'The company is the sole licensed air-navigation operator and several systems are critical infrastructure.'),
('R2', 2, 'The new CISO is committed to the incumbent platform vendor. Only independent TI is open locally. An experienced seller familiar with competing SOC environments can access a $50,000 scope.'),
('C1', 1, 'The retail SOC is mature. Core detection platforms are under a long-term competitor agreement, and a platform replacement is not planned.'),
('C1', 2, 'The SOC has a $120,000 independent TI opportunity but wants a technical proof against its current workflows before purchasing.'),
('A1', 1, 'Global HQ controls the enterprise stack. Local plants can choose OT security but cannot replace the corporate platform.'),
('A1', 2, 'A $200,000 plant program requires industrial expertise and compatibility with the existing virtualization platform and operating systems.'),
('O1', 1, 'The insurer is regulated, but has a small SOC, simple architecture and few complex buying centers.'),
('O1', 2, 'Purchasing is standardized. A local partner can add email security and awareness to renewal without an enterprise transformation project.'),
('F1', 1, 'The risk committee fears that transaction traces and security alerts will be processed outside Megaland. The next purchase requires verifiable local processing.'),
('F1', 2, 'The SOC can approve a $180,000 security-data program locally, but only if the vendor supplies evidence of a locally operated data-processing design.'),
('D1', 1, 'The provider has a mature SOC and a competitor-led core stack. Corporate platform replacement is not on the agenda.'),
('D1', 2, 'Local engineering is evaluating a $220,000 independent TI program. It needs an expert-designed integration plan to fit its managed-services architecture.'),
('Z1', 1, 'Most of the $1.9 million IT budget is committed to business applications and warehouse systems. The security team is small and buys standard products.'),
('Z1', 2, 'A regional partner can deliver endpoint and awareness as a $45,000 annual standard-products package. No enterprise SOC transformation is funded.'),
('Z2', 1, 'The three plants have local OT purchasing authority and a small approved segmentation project. Endpoint renewal is $30,000.'),
('Z2', 2, 'A $100,000 OT expansion is available, but the finance team requires a five-year comparison of offline on-premises and managed deployment costs.')
on conflict (client_code, level) do update set body = excluded.body;

-- ============ Каталог покупок ============
insert into public.catalog_items (code, category, name, cost, max_targets, leads, description, sort) values
('HINT1', 'info', 'Hint 1', 1, 1, 0, 'Дополнительная информация о клиенте, первый уровень.', 1),
('HINT2', 'info', 'Hint 2', 1, 1, 0, 'Второй уровень информации. Покупается после Hint 1.', 2),
('CONSULT', 'info', 'Встреча с бывшим коллегой', 1, 0, 0, 'Бывший коллега недавно перешёл в крупную консалтинговую фирму и предлагает встретиться.', 3),
('M1', 'marketing', 'State Critical Executive Roundtable', 6, 4, 0, '8-12 person roundtable for CISO/CIO leaders from ministries, companies with critical infrastructure. Focus: sovereign operations, local deployment and regulatory pressure.', 11),
('M2', 'marketing', 'Named-Account CISO Dinner', 5, 3, 0, 'Small invitation-only dinner for senior security leaders from one selected vertical. Attendance is based on named target accounts, not open registration.', 12),
('M3', 'marketing', 'Industrial OT Workshop', 6, 4, 5, 'Technical workshop for OT/industrial-security leaders around segmentation, visibility, offline operation and production continuity.', 13),
('M4', 'marketing', 'ABM Micro-Campaign', 6, 4, 3, 'Highly targeted 4-6 week campaign for one vertical, combining content, executive outreach.', 14),
('M5', 'marketing', 'Executive 1:1 Briefing', 4, 1, 0, 'Private executive briefing tailored to one named strategic account and one board-level business issue.', 15),
('M6', 'marketing', 'Large Industry Expo Booth', 10, 0, 100, 'Large presence at a major industry exhibition with broad brand visibility, demos and lead capture.', 16),
('M7', 'marketing', 'Regional Cyber Conference', 8, 0, 50, 'Broad regional event covering many industries and multiple cybersecurity themes.', 17),
('M8', 'marketing', 'Webinar Series', 3, 0, 20, 'Three open webinars on current cybersecurity themes with broad registration and follow-up.', 18),
('M9', 'marketing', 'PR / Press Release Package', 3, 0, 5, 'A set of local press releases and media materials around product, partnership or customer announcements.', 19),
('H1', 'hq', 'ROI and Business Case Calculator', 5, 2, 0, 'A reusable business-case model to quantify financial impact, avoided risk and payback for a cybersecurity project.', 21),
('H2', 'hq', 'On Premises and Private Cloud TCO Model', 6, 3, 0, 'A 3-5 year TCO model comparing on-prem, private-cloud and service-based deployment options.', 22),
('H3', 'hq', 'SBOM and Software Transparency Process', 5, 2, 0, 'A customer-facing process for component transparency, updates, ownership and exceptions.', 23),
('H4', 'hq', 'Compliance and Certification Support', 6, 2, 0, 'HQ support to meet customer-specific regulatory and certification requirements, including compliance documentation, audit evidence, certification readiness and coordination with external assessors.', 24),
('H5', 'hq', 'Competitive Battlecards and Migration Service', 3, 2, 0, 'Replacement triggers, objection handling, migration risks and differentiation against key incumbents.', 25),
('H6', 'hq', 'Customer Reference Pack', 4, 3, 0, 'Relevant customer references and deployment proof by vertical and use case.', 26),
('H7', 'hq', 'Proof of Concept Fast Track', 5, 2, 0, 'Pre-approved demo/PoC resources, success criteria and rapid engineering escalation.', 27),
('H8', 'hq', 'Platform Compatibility Validation', 7, 2, 0, 'Compatibility with clients virtualization platforms, operating systems and unique IT environments.', 28),
('H9', 'hq', 'Cloud Data Localization Design', 10, 2, 0, 'Design for locally operated processing of security data.', 29),
('H10', 'hq', 'Breach and Attack Simulation', 5, 2, 0, 'Simulation of realistic cyberattack scenarios to demonstrate product effectiveness, validate detection and response capabilities without disrupting business operations.', 30),
('H11', 'hq', 'Partner Enablement Session', 4, 3, 0, 'Enable selected partners on offers, triggers, qualification.', 31),
('H12', 'hq', 'HQ Architecture Expert Services', 5, 2, 0, 'Access to HQ technical experts for complex solution architecture, deployment planning.', 32)
on conflict (code) do update set category = excluded.category, name = excluded.name, cost = excluded.cost,
  max_targets = excluded.max_targets, leads = excluded.leads, description = excluded.description, sort = excluded.sort;

insert into public.catalog_secrets (code, note) values
('CONSULT', 'Several of Megaland''s largest private enterprises already operate mature Security Operations Centers and have long-term contracts with competing cybersecurity vendor. These organizations are difficult to approach with a broad security-platform replacement proposal. However, some of these companies may still be open to independent Threat Intelligence services that provide an external perspective beyond their existing security vendors. A dedicated sales professional focused on large, mature enterprise accounts could identify and develop these opportunities. You also know that one of your KAMs previously worked for this competitor and has strong knowledge of its solutions and those customers. You have been proposed to create Specialization: Other Enterprise Specialist with TI expertise.'),
('M1', 'Клиент — критическая гос. инфраструктура, подтверждена потребность в доступе к руководителям сопоставимых организаций. +50 п.п. со специалистом, +30 п.п. без. Ключ к G1 и банковскому влиянию B3.'),
('M2', '+30 п.п. Нужна потребность в контакте с коллегами/CISO; все цели из одной отрасли или вертикали.'),
('M3', '+30 п.п. с Industrial-специалистом, +10 п.п. в остальных случаях. Нужна OT-задача у клиента, которому подходит промышленная специализация.'),
('M4', '+20 п.п. Нужна доступная локальная возможность и конкретный покупатель или сценарий; все цели из одной вертикали.'),
('M5', '+50 п.п. Нужен конкретный барьер: доступ к высшему руководству или решение совета директоров.'),
('M6', 'Не влияет на текущих клиентов. Только будущие лиды.'),
('M7', 'Не влияет на текущих клиентов. Только будущие лиды.'),
('M8', 'Не влияет на текущих клиентов. Только будущие лиды.'),
('M9', 'Не влияет на текущих клиентов. Только будущие лиды.'),
('H1', 'Бюджетный комитет требует обоснование с количественными расчётами.'),
('H2', 'Покупателю нужно сравнение затрат на варианты развёртывания.'),
('H3', 'Закупочная процедура требует прозрачности состава программных компонентов.'),
('H4', 'Подтверждено требование закупочной процедуры или сертификации.'),
('H5', 'Есть возможность замены текущего решения и вопросы о различиях или миграции.'),
('H6', 'Покупателю нужны подтверждения успешного применения в сопоставимых организациях.'),
('H7', 'Заинтересованному покупателю требуется техническая проверка решения.'),
('H8', 'Конкретная проблема совместимости препятствует развёртыванию.'),
('H9', 'Конкретное требование локальной обработки данных препятствует согласованию.'),
('H10', 'После инцидента покупателю нужны технические доказательства.'),
('H11', 'Партнёру не хватает экспертизы для выявленной возможности продажи стандартных продуктов.'),
('H12', 'Сложная интеграция требует архитектурной экспертизы HQ.')
on conflict (code) do update set note = excluded.note;
