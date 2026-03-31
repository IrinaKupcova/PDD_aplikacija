-- Atgūšana: ja 302200 apstājās pie kļūdas, funkcijas pdd_submit_absence_session neeksistē.
-- Palaid šo failu SQL Editorī — idempotents.

alter table public.pdd_deputy_state
  add column if not exists deputy_valid_from date,
  add column if not exists deputy_valid_to date;

alter table public.prombutnes_dati
  add column if not exists apstiprinajuma_statuss text;

alter table public.prombutnes_veidi
  add column if not exists name text;

alter table public.users
  add column if not exists "e-pasts" text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'type'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'name'
  ) then
    update public.prombutnes_veidi v
    set name = nullif(trim(coalesce(v.type::text, '')), '')
    where (v.name is null or trim(v.name) = '') and v.type is not null;
  end if;
end $$;

create or replace function public.pdd_can_approve_absences()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and lower(trim(coalesce(u.role, ''))) in ('manager', 'admin')
      ),
      false
    )
    or coalesce(
      exists (
        select 1 from public.pdd_deputy_state d
        where d.id = 1
          and d.deputy_user_id is not null
          and d.deputy_user_id = auth.uid()
          and (d.deputy_valid_from is null or current_date >= d.deputy_valid_from)
          and (d.deputy_valid_to is null or current_date <= d.deputy_valid_to)
      ),
      false
    );
$$;

revoke all on function public.pdd_can_approve_absences() from public;
grant execute on function public.pdd_can_approve_absences() to authenticated;

create or replace function public.pdd_lookup_user_by_email(p_email text)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_norm text;
begin
  v_norm := lower(trim(coalesce(p_email, '')));
  if v_norm = '' or position('@' in v_norm) = 0 then
    return;
  end if;

  return query
  select u.id
  from public.users u
  where lower(trim(coalesce(u.email, ''))) = v_norm
     or lower(trim(coalesce(u."i-mail", ''))) = v_norm
     or lower(trim(coalesce(u."e-mail", ''))) = v_norm
     or lower(trim(coalesce(u."e-pasts", ''))) = v_norm
  limit 1;
end;
$$;

revoke all on function public.pdd_lookup_user_by_email(text) from public;
grant execute on function public.pdd_lookup_user_by_email(text) to anon, authenticated;

create or replace function public.pdd_actor_can_submit_for_others(p_actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_actor_user_id
      and lower(trim(coalesce(u.role, ''))) in ('manager', 'admin')
  );
$$;

revoke all on function public.pdd_actor_can_submit_for_others(uuid) from public;
grant execute on function public.pdd_actor_can_submit_for_others(uuid) to anon, authenticated;

create or replace function public.pdd_session_match_actor(p_actor_user_id uuid, p_actor_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_actor_user_id
      and lower(trim(coalesce(p_actor_email, ''))) <> ''
      and position('@' in lower(trim(coalesce(p_actor_email, '')))) > 0
      and (
        lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(p_actor_email, '')))
        or lower(trim(coalesce(u."i-mail", ''))) = lower(trim(coalesce(p_actor_email, '')))
        or lower(trim(coalesce(u."e-mail", ''))) = lower(trim(coalesce(p_actor_email, '')))
        or lower(trim(coalesce(u."e-pasts", ''))) = lower(trim(coalesce(p_actor_email, '')))
      )
  );
$$;

revoke all on function public.pdd_session_match_actor(uuid, text) from public;
grant execute on function public.pdd_session_match_actor(uuid, text) to anon, authenticated;

-- PostgREST no JSON bieži sūta skaitli kā bigint; ar integer signatūru meklē neesošu pārslodzi → 42883.
drop function if exists public.pdd_submit_absence_session(uuid, uuid, uuid, integer, date, date, text);
drop function if exists public.pdd_submit_absence_session(uuid, uuid, uuid, bigint, date, date, text);

create or replace function public.pdd_submit_absence_session(
  p_actor_user_id uuid,
  p_actor_email text,
  p_target_user_id uuid,
  p_type_id bigint,
  p_start date,
  p_end date,
  p_comment text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new uuid;
begin
  if not public.pdd_session_match_actor(p_actor_user_id, p_actor_email) then
    raise exception 'Nederīga sesija: e-pasts nesakrīt ar lietotāju (atkārtoti ieej).';
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Nepareizi datumi';
  end if;

  if not exists (select 1 from public.prombutnes_veidi v where v.id = p_type_id::integer) then
    raise exception 'Nederīgs prombūtnes veida ID (prombutnes_veidi).';
  end if;

  if not public.pdd_actor_can_submit_for_others(p_actor_user_id) and p_target_user_id <> p_actor_user_id then
    raise exception 'Parastam lietotājam var pieteikt prombūtni tikai sev';
  end if;

  insert into public.prombutnes_dati (
    user_id,
    type_id,
    start_date,
    end_date,
    comment,
    status,
    approved_at,
    approved_by,
    apstiprinajuma_statuss
  )
  values (
    p_target_user_id,
    p_type_id::integer,
    p_start,
    p_end,
    nullif(trim(coalesce(p_comment, '')), ''),
    'approved',
    now(),
    null,
    'apstiprināts'
  )
  returning id into v_new;

  return v_new;
end;
$$;

revoke all on function public.pdd_submit_absence_session(uuid, uuid, uuid, bigint, date, date, text) from public;
grant execute on function public.pdd_submit_absence_session(uuid, uuid, uuid, bigint, date, date, text) to anon, authenticated;

create or replace function public.pdd_submit_cits_request_session(
  p_actor_user_id uuid,
  p_actor_email text,
  p_target_user_id uuid,
  p_start date,
  p_end date,
  p_comment text,
  p_notify_email text
)
returns table (request_id uuid, approval_token uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pdd_session_match_actor(p_actor_user_id, p_actor_email) then
    raise exception 'Nederīga sesija: e-pasts nesakrīt ar lietotāju (atkārtoti ieej).';
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Nepareizi datumi';
  end if;

  if trim(coalesce(p_notify_email, '')) = '' or position('@' in trim(p_notify_email)) = 0 then
    raise exception 'Nav derīga apstiprinātāja e-pasta';
  end if;

  if not public.pdd_actor_can_submit_for_others(p_actor_user_id) and p_target_user_id <> p_actor_user_id then
    raise exception 'Parastam lietotājam šo veidu var pieteikt tikai sev';
  end if;

  return query
  insert into public.pdd_cits_requests (
    user_id,
    start_date,
    end_date,
    comment,
    notify_email
  )
  values (
    p_target_user_id,
    p_start,
    p_end,
    nullif(trim(coalesce(p_comment, '')), ''),
    trim(p_notify_email)
  )
  returning id as request_id, approval_token;
end;
$$;

revoke all on function public.pdd_submit_cits_request_session(uuid, uuid, uuid, date, date, text, text) from public;
grant execute on function public.pdd_submit_cits_request_session(uuid, uuid, uuid, date, date, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
