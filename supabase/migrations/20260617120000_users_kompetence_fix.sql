-- Komandas tabula: Kompetence kolonna + RPC kā Aizvieto (ar "e-mail" kolonnu aktiera meklēšanā).

alter table public.users
  add column if not exists "Kompetence" text;

create or replace function public.pdd_update_user_kompetence_by_email(
  p_actor_email text,
  p_target_user_id uuid,
  p_kompetence text
)
returns public.users
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_actor_email, '')));
  v_row public.users;
begin
  if v_email = '' then
    raise exception 'Trūkst lietotāja e-pasts.';
  end if;

  if not exists (
    select 1
    from public.users u
    where lower(trim(coalesce(u.email, u."i-mail", u."e-mail", ''))) = v_email
  ) then
    raise exception 'Nav tiesību: lietotājs nav atrasts public.users pēc e-pasta.';
  end if;

  update public.users
  set "Kompetence" = nullif(trim(coalesce(p_kompetence, '')), '')
  where id = p_target_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Users rinda netika atjaunota.';
  end if;

  return v_row;
end;
$$;

create or replace function public.pdd_update_user_kompetence_open_by_email(
  p_actor_email text,
  p_target_user_id uuid,
  p_kompetence text
)
returns public.users
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_actor_email, '')));
  v_row public.users;
begin
  if v_email = '' then
    raise exception 'Trūkst lietotāja e-pasts.';
  end if;

  if not exists (
    select 1
    from public.users u
    where lower(trim(coalesce(u.email, u."i-mail", u."e-mail", ''))) = v_email
  ) then
    raise exception 'Nav tiesību: lietotājs nav atrasts public.users pēc e-pasta.';
  end if;

  update public.users
  set "Kompetence" = nullif(trim(coalesce(p_kompetence, '')), '')
  where id = p_target_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Users rinda netika atjaunota.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.pdd_update_user_kompetence_by_email(text, uuid, text) from public;
grant execute on function public.pdd_update_user_kompetence_by_email(text, uuid, text) to anon, authenticated;

revoke all on function public.pdd_update_user_kompetence_open_by_email(text, uuid, text) from public;
grant execute on function public.pdd_update_user_kompetence_open_by_email(text, uuid, text) to anon, authenticated;
