-- v0.2.1: обучения KAM. До конца Round 1.3 специализацию можно менять бесплатно,
-- после — каждое новое обучение стоит ещё cost_spec монет, оплаченное не возвращается.
-- Выполнять после 003_budget_specs_prefs.sql.

create table if not exists public.spec_trainings (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  kam smallint not null,
  specialization text not null check (specialization in ('government', 'industrial', 'finance', 'telecom', 'other_enterprise')),
  locked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists spec_trainings_team_idx on public.spec_trainings (team_id);

-- Раунды, в которых обучение ещё не зафиксировано.
create or replace function public.spec_phase_free(p_phase text)
returns boolean language sql immutable as $$
  select p_phase in ('lobby', 'r1p1', 'r1p2', 'r1p3');
$$;

-- Перенос уже выбранных специализаций (один раз, если обучений у команды ещё нет).
insert into public.spec_trainings (team_id, kam, specialization, locked)
select k.team_id, k.kam, k.specialization, not public.spec_phase_free(g.phase)
from public.team_kams k
join public.teams t on t.id = k.team_id
join public.games g on g.id = t.game_id
where k.specialization is not null
  and not exists (select 1 from public.spec_trainings s where s.team_id = k.team_id);

-- Потрачено: проведённые покупки + все оплаченные обучения.
create or replace function public.team_spent(p_team uuid, p_settings jsonb)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(cost) from public.purchases where team_id = p_team and status = 'approved'), 0)
    + (select count(*) from public.spec_trainings where team_id = p_team) * public.gs(p_settings, 'cost_spec');
$$;
revoke all on function public.team_spent(uuid, jsonb) from public, anon, authenticated;

create or replace function public.set_kam_spec(p_team uuid, p_kam int, p_spec text)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  s jsonb;
  v_old text;
  v_free boolean;
  v_paid boolean;
begin
  if not (public.can_manage_team(p_team) or public.is_captain_of(p_team)) then raise exception 'E_NO_RIGHTS_SPEC'; end if;
  g := public.lock_team_game(p_team);
  s := g.settings;
  if not public.can_manage_team(p_team) and g.phase not in ('r1p3', 'r2p1', 'r2p2', 'r3', 'r4') then
    raise exception 'E_PHASE_SPEC';
  end if;
  if p_kam is null or p_kam < 1 or p_kam > public.gs(s, 'kams') then raise exception 'E_NO_KAM'; end if;
  if p_spec is not null and p_spec not in ('government', 'industrial', 'finance', 'telecom', 'other_enterprise') then
    raise exception 'E_SPEC_UNKNOWN';
  end if;
  if p_spec = 'other_enterprise' and not public.team_has_item(p_team, 'CONSULT', null) then
    raise exception 'E_SPEC_LOCKED';
  end if;

  select specialization into v_old from public.team_kams where team_id = p_team and kam = p_kam;
  if p_spec is not distinct from v_old then return; end if;
  v_free := public.spec_phase_free(g.phase);

  if p_spec is not null then
    if exists (select 1 from public.team_kams where team_id = p_team and kam <> p_kam and specialization = p_spec) then
      raise exception 'E_SPEC_DUPLICATE';
    end if;
    if v_old is null and (select count(*) from public.team_kams where team_id = p_team and specialization is not null)
       >= public.gs(s, 'max_specs') then
      raise exception 'E_SPEC_MAX|%', public.gs(s, 'max_specs');
    end if;
  end if;

  -- До фиксации неоплаченное окончательно обучение этого KAM заменяется (монеты возвращаются).
  if v_free then
    delete from public.spec_trainings where team_id = p_team and kam = p_kam and not locked;
  end if;

  if p_spec is not null then
    -- Этот KAM уже обучен этому направлению — повторно не платим.
    select exists (select 1 from public.spec_trainings where team_id = p_team and kam = p_kam and specialization = p_spec)
      into v_paid;
    if not v_paid then
      if public.team_spent(p_team, s) + public.gs(s, 'cost_spec') > public.gs(s, 'budget') then
        raise exception 'E_BUDGET|%|%|%', public.team_spent(p_team, s), public.gs(s, 'budget'), public.gs(s, 'cost_spec');
      end if;
      insert into public.spec_trainings (team_id, kam, specialization, locked) values (p_team, p_kam, p_spec, not v_free);
    end if;
  end if;

  insert into public.team_kams (team_id, kam, specialization) values (p_team, p_kam, p_spec)
  on conflict (team_id, kam) do update set specialization = excluded.specialization;
end $$;

-- Конец Round 1.3: обучения фиксируются, дальше смена стоит новых монет.
create or replace function public.lock_spec_trainings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phase is distinct from old.phase and not public.spec_phase_free(new.phase) then
    update public.spec_trainings st set locked = true
      from public.teams t where t.id = st.team_id and t.game_id = new.id and not st.locked;
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_spec_trainings on public.games;
create trigger trg_lock_spec_trainings
  after update of phase on public.games
  for each row execute function public.lock_spec_trainings();

alter table public.spec_trainings enable row level security;
drop policy if exists spec_trainings_select on public.spec_trainings;
create policy spec_trainings_select on public.spec_trainings for select to authenticated using (public.can_view_team(team_id));

do $$
begin
  alter publication supabase_realtime add table public.spec_trainings;
exception when duplicate_object then null;
end $$;
