  -- Paplašinājums: Cits (ar vadītāja saskaņojumu), dzēšana/labošana, vadītāja insert.
  -- Viena lietotāju tabula: public.users (nav skata, nav public.profiles).

  -- Pāreja no vecās shēmas (profiles / skats users)
  drop view if exists public.users cascade;

  do $$
  begin
    if to_regclass('public.profiles') is not null and to_regclass('public.users') is null then
      alter table public.profiles rename to users;
    end if;
  end$$;

  do $$
  begin
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'users' and policyname = 'profiles_select_authenticated'
    ) then
      alter policy "profiles_select_authenticated" on public.users rename to "users_select_authenticated";
    end if;
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'users' and policyname = 'profiles_update_own'
    ) then
      alter policy "profiles_update_own" on public.users rename to "users_update_own";
    end if;
  end$$;

  drop policy if exists "prombutnes_manager_approve" on public.prombutnes_dati;
  create policy "prombutnes_manager_approve" on public.prombutnes_dati
    for update to authenticated
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('manager', 'admin')
      )
    );

  create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_fn text;
    v_ln text;
    v_full text;
  begin
    v_fn := nullif(trim(new.raw_user_meta_data ->> 'first_name'), '');
    v_ln := nullif(trim(new.raw_user_meta_data ->> 'last_name'), '');
    v_full := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
    if v_full is null and (v_fn is not null or v_ln is not null) then
      v_full := trim(concat_ws(' ', v_fn, v_ln));
    end if;
    insert into public.users (id, full_name, role, email)
    values (
      new.id,
      coalesce(v_full, split_part(new.email, '@', 1)),
      coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'employee'),
      new.email
    );
    return new;
  end;
  $$;

  create table if not exists public.pdd_cits_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    start_date date not null,
    end_date date not null,
    comment text,
    notify_email text not null,
    approval_token uuid not null default gen_random_uuid() unique,
    status text not null default 'pending_manager'
      check (status in ('pending_manager', 'approved', 'cancelled')),
    created_at timestamptz not null default now(),
    approved_absence_id uuid references public.prombutnes_dati (id),
    check (end_date >= start_date)
  );

  create index if not exists idx_pdd_cits_token on public.pdd_cits_requests (approval_token);
  create index if not exists idx_pdd_cits_user on public.pdd_cits_requests (user_id);

  alter table public.pdd_cits_requests enable row level security;

  drop policy if exists "pdd_cits_insert_own" on public.pdd_cits_requests;
  create policy "pdd_cits_insert_own" on public.pdd_cits_requests
    for insert to authenticated with check (auth.uid() = user_id);

  drop policy if exists "pdd_cits_select_own" on public.pdd_cits_requests;
  create policy "pdd_cits_select_own" on public.pdd_cits_requests
    for select to authenticated using (auth.uid() = user_id);

  drop policy if exists "pdd_cits_select_manager" on public.pdd_cits_requests;
  create policy "pdd_cits_select_manager" on public.pdd_cits_requests
    for select to authenticated using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('manager', 'admin')
      )
    );

  drop policy if exists "prombutnes_delete_own_or_manager" on public.prombutnes_dati;
  create policy "prombutnes_delete_own_or_manager" on public.prombutnes_dati
    for delete to authenticated using (
      auth.uid() = user_id
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('manager', 'admin')
      )
    );

  drop policy if exists "prombutnes_update_own_pending" on public.prombutnes_dati;
  drop policy if exists "prombutnes_update_own" on public.prombutnes_dati;
  create policy "prombutnes_update_own" on public.prombutnes_dati
    for update to authenticated
    using (auth.uid() = user_id and status = 'pending')
    with check (auth.uid() = user_id and status = 'pending');

  drop policy if exists "prombutnes_manager_update_any" on public.prombutnes_dati;
  create policy "prombutnes_manager_update_any" on public.prombutnes_dati
    for update to authenticated
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('manager', 'admin')
      )
    )
    with check (true);

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

  grant execute on function public.pdd_cits_preview(uuid) to anon, authenticated;

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
      raise exception 'Nav atrasts veids „Cits (ar vadītāja saskaņojumu)"';
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

  grant execute on function public.pdd_approve_cits_token(uuid) to anon, authenticated;

  drop policy if exists "prombutnes_insert_manager" on public.prombutnes_dati;
  create policy "prombutnes_insert_manager" on public.prombutnes_dati
    for insert to authenticated
    with check (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('manager', 'admin')
      )
    );
