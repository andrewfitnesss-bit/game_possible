-- v0.2.4: третье оформление «Уолл-стрит 90-х». Выполнять после 006_team_names.sql.

create or replace function public.set_my_prefs(p_prefs jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'E_NO_RIGHTS'; end if;
  if coalesce(p_prefs ->> 'theme', 'arena') not in ('arena', 'corp', 'wallst')
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
