do $$
declare
  v_name_col text;
  v_color_col text;
  v_sort_col text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'name'
  ) then
    v_name_col := 'name';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'Name'
  ) then
    v_name_col := 'Name';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'type'
  ) then
    v_name_col := 'type';
  else
    raise exception 'Neatradu prombutnes_veidi nosaukuma kolonnu (name/Name/type).';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'color'
  ) then
    v_color_col := 'color';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'sort_order'
  ) then
    v_sort_col := 'sort_order';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'sortorder'
  ) then
    v_sort_col := 'sortorder';
  end if;

  if v_color_col is not null and v_sort_col is not null then
    execute format(
      'insert into public.prombutnes_veidi (%I, %I, %I)
       values ($1, $2, $3)
       on conflict do nothing',
      v_name_col, v_color_col, v_sort_col
    )
    using 'Prombūtne (jau saskaņota citā kanālā)', '#0f766e', 8;
  elsif v_color_col is not null then
    execute format(
      'insert into public.prombutnes_veidi (%I, %I)
       values ($1, $2)
       on conflict do nothing',
      v_name_col, v_color_col
    )
    using 'Prombūtne (jau saskaņota citā kanālā)', '#0f766e';
  elsif v_sort_col is not null then
    execute format(
      'insert into public.prombutnes_veidi (%I, %I)
       values ($1, $2)
       on conflict do nothing',
      v_name_col, v_sort_col
    )
    using 'Prombūtne (jau saskaņota citā kanālā)', 8;
  else
    execute format(
      'insert into public.prombutnes_veidi (%I)
       values ($1)
       on conflict do nothing',
      v_name_col
    )
    using 'Prombūtne (jau saskaņota citā kanālā)';
  end if;
end $$;
