-- Fallback RPC funkcijas gadījumiem, kad auth.uid() nesakrīt ar PDD lietotāja rindu,
-- bet lietotājs ir korekti identificēts pēc darba e-pasta.

create or replace function public.pdd_can_manage_by_email(p_actor_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_actor_email, '')));
begin
  if v_email = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.users u
    where lower(trim(coalesce(u.email, u."i-mail", ''))) = v_email
      and lower(trim(coalesce(u.role, ''))) = 'admin'
  );
end;
$$;

revoke all on function public.pdd_can_manage_by_email(text) from public;
grant execute on function public.pdd_can_manage_by_email(text) to anon, authenticated;

create or replace function public.pdd_update_aktualitate_by_email(
  p_actor_email text,
  p_id uuid,
  p_html text,
  p_sakums date,
  p_beigas date
)
returns public."AKTUALITATES"
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_actor_email, '')));
  v_row public."AKTUALITATES";
begin
  if v_email = '' then
    raise exception 'Trūkst lietotāja e-pasts.';
  end if;

  if not exists (
    select 1
    from public."AKTUALITATES" a
    left join auth.users au on au.id = a."Autors"
    where a.id = p_id
      and (
        lower(trim(coalesce(au.email, ''))) = v_email
        or public.pdd_can_manage_by_email(v_email)
      )
  ) then
    raise exception 'Nav tiesību labot šo aktualitāti.';
  end if;

  update public."AKTUALITATES"
  set
    "Kas_sodien_vel_aktuals" = p_html,
    "Sakums" = p_sakums,
    "Beigas" = p_beigas
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Aktualitātes ieraksts netika atjaunots.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.pdd_update_aktualitate_by_email(text, uuid, text, date, date) from public;
grant execute on function public.pdd_update_aktualitate_by_email(text, uuid, text, date, date) to anon, authenticated;

create or replace function public.pdd_update_user_aizvieto_by_email(
  p_actor_email text,
  p_target_user_id uuid,
  p_aizvieto text
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
    where u.id = p_target_user_id
      and (
        lower(trim(coalesce(u.email, u."i-mail", ''))) = v_email
        or public.pdd_can_manage_by_email(v_email)
      )
  ) then
    raise exception 'Nav tiesību mainīt aizvietotāju šim lietotājam.';
  end if;

  update public.users
  set "Aizvieto" = nullif(trim(coalesce(p_aizvieto, '')), '')
  where id = p_target_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Users rinda netika atjaunota.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.pdd_update_user_aizvieto_by_email(text, uuid, text) from public;
grant execute on function public.pdd_update_user_aizvieto_by_email(text, uuid, text) to anon, authenticated;
