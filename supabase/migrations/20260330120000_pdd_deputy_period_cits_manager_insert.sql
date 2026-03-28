-- p.i. derīguma periods; Cits veida nosaukums; vadītājs var iesniegt Cits arī citam lietotājam.

alter table public.pdd_deputy_state
  add column if not exists deputy_valid_from date,
  add column if not exists deputy_valid_to date;

update public.prombutnes_veidi
set name = 'Cits (ar saskaņojumu)'
where name = 'Cits (saskaņots)';

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
        where u.id = auth.uid() and u.role in ('manager', 'admin')
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

create or replace function public.pdd_approve_cits_token(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid uuid;
  v_uid uuid;
  v_start date;
  v_end date;
  v_comment text;
  v_type_id int;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Nepieciešama autentifikācija.';
  end if;
  if not (select public.pdd_can_approve_absences()) then
    raise exception 'Apstiprināt drīkst tikai vadītājs, administrators vai aktuālais p.i.';
  end if;

  select r.id, r.user_id, r.start_date, r.end_date, r.comment
  into v_rid, v_uid, v_start, v_end, v_comment
  from public.pdd_cits_requests r
  where r.approval_token = p_token and r.status = 'pending_manager'
  for update;

  if v_rid is null then
    raise exception 'Nederīgs vai jau apstrādāts tokens';
  end if;

  select v.id into v_type_id
  from public.prombutnes_veidi v
  where v.name = 'Cits (ar saskaņojumu)'
  limit 1;

  if v_type_id is null then
    raise exception 'Nav atrasts veids „Cits (ar saskaņojumu)”';
  end if;

  insert into public.prombutnes_dati (
    user_id, type_id, start_date, end_date, comment, status, approved_at
  )
  values (
    v_uid, v_type_id, v_start, v_end, v_comment, 'approved', now()
  )
  returning id into v_new_id;

  update public.pdd_cits_requests
  set status = 'approved', approved_absence_id = v_new_id
  where id = v_rid;

  return v_new_id;
end;
$$;

drop policy if exists "pdd_cits_insert_manager" on public.pdd_cits_requests;
create policy "pdd_cits_insert_manager" on public.pdd_cits_requests
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('manager', 'admin')
    )
  );
