-- Apstiprināšana (prombūtnes, Cits saite): vadītājs, administrators vai aktuālais p.i. (pdd_deputy_state).
-- Nepieciešama migrācija ar pdd_deputy_state (20260329140000).

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
      ),
      false
    );
$$;

revoke all on function public.pdd_can_approve_absences() from public;
grant execute on function public.pdd_can_approve_absences() to authenticated;

drop policy if exists "prombutnes_manager_approve" on public.prombutnes_dati;
create policy "prombutnes_manager_approve" on public.prombutnes_dati
  for update to authenticated
  using (public.pdd_can_approve_absences());

drop policy if exists "prombutnes_manager_update_any" on public.prombutnes_dati;
create policy "prombutnes_manager_update_any" on public.prombutnes_dati
  for update to authenticated
  using (public.pdd_can_approve_absences())
  with check (true);

drop policy if exists "prombutnes_delete_own_or_manager" on public.prombutnes_dati;
create policy "prombutnes_delete_own_or_manager" on public.prombutnes_dati
  for delete to authenticated using (
    auth.uid() = user_id
    or public.pdd_can_approve_absences()
  );

drop policy if exists "prombutnes_insert_manager" on public.prombutnes_dati;
create policy "prombutnes_insert_manager" on public.prombutnes_dati
  for insert to authenticated
  with check (public.pdd_can_approve_absences());

drop policy if exists "pdd_cits_select_manager" on public.pdd_cits_requests;
create policy "pdd_cits_select_manager" on public.pdd_cits_requests
  for select to authenticated using (public.pdd_can_approve_absences());

create or replace function public.pdd_cits_preview(p_token uuid)
returns table (
  start_date date,
  end_date date,
  employee_name text,
  comment text,
  ok boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'Nepieciešama autentifikācija. Atver saiti pēc ielogošanās PDD aplikācijā.';
  end if;
  if not (select public.pdd_can_approve_absences()) then
    raise exception 'Apstiprināt drīkst tikai vadītājs, administrators vai aktuālais p.i.';
  end if;

  select count(*) into n
  from public.pdd_cits_requests r
  where r.approval_token = p_token and r.status = 'pending_manager';
  if n = 0 then
    return query select null::date, null::date, null::text, null::text, false;
    return;
  end if;
  return query
  select
    r.start_date,
    r.end_date,
    coalesce(u.full_name, ''),
    coalesce(r.comment, ''),
    true
  from public.pdd_cits_requests r
  left join public.users u on u.id = r.user_id
  where r.approval_token = p_token and r.status = 'pending_manager'
  limit 1;
end;
$$;

revoke execute on function public.pdd_cits_preview(uuid) from anon;
grant execute on function public.pdd_cits_preview(uuid) to authenticated;

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
  where v.name = 'Cits (ar vadītāja saskaņojumu)'
  limit 1;

  if v_type_id is null then
    raise exception 'Nav atrasts veids „Cits (ar vadītāja saskaņojumu)”';
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

revoke execute on function public.pdd_approve_cits_token(uuid) from anon;
grant execute on function public.pdd_approve_cits_token(uuid) to authenticated;
