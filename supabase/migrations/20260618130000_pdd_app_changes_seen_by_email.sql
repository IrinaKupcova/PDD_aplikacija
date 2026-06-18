-- NEW badge starp ierīcēm: saglabā skatīto izmaiņu ID lietotāja rindā public.users.

alter table public.users
  add column if not exists pdd_app_changes_seen_id text;

create or replace function public.pdd_get_app_changes_seen_by_email(p_actor_email text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_actor_email, '')));
  v_seen text;
begin
  if v_email = '' then
    return null;
  end if;

  select nullif(trim(coalesce(u.pdd_app_changes_seen_id, '')), '')
  into v_seen
  from public.users u
  where lower(trim(coalesce(u.email, u."i-mail", u."e-mail", ''))) = v_email
  limit 1;

  return v_seen;
end;
$$;

create or replace function public.pdd_set_app_changes_seen_by_email(
  p_actor_email text,
  p_seen_id text
)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_actor_email, '')));
  v_seen text := nullif(trim(coalesce(p_seen_id, '')), '');
  v_row public.users;
begin
  if v_email = '' then
    raise exception 'Trūkst lietotāja e-pasts.';
  end if;

  update public.users
  set pdd_app_changes_seen_id = v_seen
  where lower(trim(coalesce(email, "i-mail", "e-mail", ''))) = v_email
  returning pdd_app_changes_seen_id into v_row;

  if v_row is null then
    raise exception 'Nav atrasts public.users ieraksts ar šo e-pastu.';
  end if;

  return v_row.pdd_app_changes_seen_id;
end;
$$;

revoke all on function public.pdd_get_app_changes_seen_by_email(text) from public;
grant execute on function public.pdd_get_app_changes_seen_by_email(text) to anon, authenticated;

revoke all on function public.pdd_set_app_changes_seen_by_email(text, text) from public;
grant execute on function public.pdd_set_app_changes_seen_by_email(text, text) to anon, authenticated;
