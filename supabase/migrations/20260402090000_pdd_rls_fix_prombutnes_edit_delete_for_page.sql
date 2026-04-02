-- Fix RLS so the PDD page can update/delete/insert rows for their owner.
-- Also keeps the rule: Cits (ar vadītāja saskaņojumu) ar status=approved neļauj labot.

begin;

alter table public.prombutnes_dati enable row level security;

-- Šeit ir dzīvā shēma atšķirīga (reizēm ir `type_id`, reizēm `type` utt.),
-- tāpēc izveidojam politikas ar dinamišku SQL, paņemot eksistējošos kolonu nosaukumus.
do $$
declare
  v_user_col text;
  v_type_col text;
  v_status_col text;
  v_type_name_col text;
begin
  -- user (owner) kolonna
  select
    case
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_dati' and column_name='user_id'
      ) then 'user_id'
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_dati' and column_name='darbinieks_id'
      ) then 'darbinieks_id'
      else null
    end
  into v_user_col;

  -- type kolonna
  select
    case
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_dati' and column_name='type_id'
      ) then 'type_id'
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_dati' and column_name='type'
      ) then 'type'
      else null
    end
  into v_type_col;

  -- status kolonna
  select
    case
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_dati' and column_name='status'
      ) then 'status'
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_dati' and column_name='Statuss'
      ) then 'Statuss'
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_dati' and column_name='statuss'
      ) then 'statuss'
      else null
    end
  into v_status_col;

  if v_user_col is null then
    raise exception 'Neatradu owner kolonu (user_id / darbinieks_id) public.prombutnes_dati.';
  end if;
  if v_type_col is null then
    raise exception 'Neatradu type kolonu (type_id / type) public.prombutnes_dati.';
  end if;
  if v_status_col is null then
    raise exception 'Neatradu status kolonu (status / Statuss / statuss) public.prombutnes_dati.';
  end if;

  -- Kolonnu, pēc kuras rakstura nosakām “Cits (ar vadītāja saskaņojumu)” (name/Name/type utt).
  select
    case
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_veidi' and column_name='name'
      ) then 'name'
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_veidi' and column_name='Name'
      ) then 'Name'
      when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='prombutnes_veidi' and column_name='type'
      ) then 'type'
      else null
    end
  into v_type_name_col;

  if v_type_name_col is null then
    raise exception 'Neatradu nosaukuma kolonu prombutnes_veidi (name/Name/type).';
  end if;

  -- Insert: owner can create.
  execute 'drop policy if exists "prombutnes_insert_own" on public.prombutnes_dati';
  execute format(
    'create policy "prombutnes_insert_own" on public.prombutnes_dati for insert to authenticated with check (auth.uid() = %I)',
    v_user_col
  );

  -- Update:
  -- - owner can update non-Cits rows always
  -- - for Cits rows: owner can update only status in ('pending','rejected')
  execute 'drop policy if exists "prombutnes_update_own" on public.prombutnes_dati';
  execute 'drop policy if exists "prombutnes_update_own_pending" on public.prombutnes_dati';
  execute format(
    'create policy "prombutnes_update_own" on public.prombutnes_dati
      for update to authenticated
      using (
        auth.uid() = %I
        and (
          not exists (
            select 1
            from public.prombutnes_veidi v
            where v.id = (%I)::integer
              and lower(trim(coalesce(v.%I::text, ''''))) like ''%%cits%%''
              and lower(trim(coalesce(v.%I::text, ''''))) like ''%%vad%%''
              and lower(trim(coalesce(v.%I::text, ''''))) like ''%%sask%%''
          )
          or %I in (''pending'', ''pending_manager'', ''gaida'', ''rejected'')
        )
      )
      with check (
        auth.uid() = %I
        and (
          not exists (
            select 1
            from public.prombutnes_veidi v
            where v.id = (%I)::integer
              and lower(trim(coalesce(v.%I::text, ''''))) like ''%%cits%%''
              and lower(trim(coalesce(v.%I::text, ''''))) like ''%%vad%%''
              and lower(trim(coalesce(v.%I::text, ''''))) like ''%%sask%%''
          )
          or %I in (''pending'', ''pending_manager'', ''gaida'', ''rejected'')
        )
      )',
    v_user_col, v_type_col, v_type_name_col, v_type_name_col, v_type_name_col, v_status_col,
    v_user_col, v_type_col, v_type_name_col, v_type_name_col, v_type_name_col, v_status_col
  );

  -- Delete:
  -- - owner can delete their rows
  -- - manager/admin can delete any rows
  execute 'drop policy if exists "prombutnes_delete_own_or_manager" on public.prombutnes_dati';
  execute format(
    'create policy "prombutnes_delete_own_or_manager" on public.prombutnes_dati
      for delete to authenticated
      using (
        auth.uid() = %I
        or exists (
          select 1
          from public.users u
          where u.id = auth.uid()
            and u.role in (''manager'', ''admin'')
        )
      )',
    v_user_col
  );
end $$;

commit;

