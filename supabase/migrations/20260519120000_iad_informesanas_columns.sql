-- IaD informēšanas dati: auditācijas vēsture, saņēmēju snapshot, mēneša atgādinājumu žurnāls.

do $$
declare
  t text;
begin
  select c.relname
    into t
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and lower(c.relname) in (lower('IAD'), lower('iad'), lower('Iad'))
  order by case c.relname when 'IAD' then 0 when 'iad' then 1 else 2 end
  limit 1;

  if t is null then
    raise notice 'IAD tabula netika atrasta, migrācija izlaista.';
    return;
  end if;

  execute format(
    'alter table public.%I add column if not exists %I jsonb not null default ''[]''::jsonb;',
    t,
    'Informesanas_auditu_vesture'
  );
  execute format(
    'alter table public.%I add column if not exists %I jsonb not null default ''[]''::jsonb;',
    t,
    'Informesanas_sanemtaji'
  );
  execute format(
    'alter table public.%I add column if not exists %I jsonb not null default ''{}''::jsonb;',
    t,
    'Informesanas_atgadinajumi'
  );

  execute format(
    'update public.%I set %I = ''[]''::jsonb where %I is null;',
    t, 'Informesanas_auditu_vesture', 'Informesanas_auditu_vesture'
  );
  execute format(
    'update public.%I set %I = ''[]''::jsonb where %I is null;',
    t, 'Informesanas_sanemtaji', 'Informesanas_sanemtaji'
  );
  execute format(
    'update public.%I set %I = ''{}''::jsonb where %I is null;',
    t, 'Informesanas_atgadinajumi', 'Informesanas_atgadinajumi'
  );
end
$$;

create or replace function public.pdd_iad_patch_informesanas(
  p_row_id text,
  p_append_audit jsonb default null,
  p_sanemtaji jsonb default null,
  p_atgadinajumi jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table regclass;
  v_relname text;
  v_updated integer := 0;
  v_result jsonb;
  v_id_col text;
  v_id_cols text[] := array['IAD.id', 'id', 'ID', 'iad_id', 'IAD_id', 'IAD_ID'];
begin
  if coalesce(trim(p_row_id), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_row_id');
  end if;

  v_table := to_regclass('public."IAD"');
  if v_table is null then v_table := to_regclass('public.iad'); end if;
  if v_table is null then v_table := to_regclass('public."Iad"'); end if;
  if v_table is null then
    return jsonb_build_object('ok', false, 'reason', 'iad_table_not_found');
  end if;

  select c.relname into v_relname from pg_class c where c.oid = v_table;

  if p_append_audit is null and p_sanemtaji is null and p_atgadinajumi is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_patch');
  end if;

  foreach v_id_col in array v_id_cols loop
    begin
      execute format(
        'update public.%I set
          "Informesanas_auditu_vesture" = case
            when $1 is not null then coalesce("Informesanas_auditu_vesture", ''[]''::jsonb) || jsonb_build_array($1)
            else "Informesanas_auditu_vesture"
          end,
          "Informesanas_sanemtaji" = case
            when $2 is not null then $2
            else "Informesanas_sanemtaji"
          end,
          "Informesanas_atgadinajumi" = case
            when $3 is not null then $3
            else "Informesanas_atgadinajumi"
          end
        where %s = $4',
        v_relname,
        case
          when v_id_col = 'IAD.id' then '"IAD.id"::text'
          else format('%I::text', v_id_col)
        end
      )
      using p_append_audit, p_sanemtaji, p_atgadinajumi, p_row_id;

      get diagnostics v_updated = row_count;
      if v_updated > 0 then
        if v_id_col = 'IAD.id' then
          execute format(
            'select jsonb_build_object(
              ''ok'', true,
              ''Informesanas_auditu_vesture'', coalesce("Informesanas_auditu_vesture", ''[]''::jsonb),
              ''Informesanas_sanemtaji'', coalesce("Informesanas_sanemtaji", ''[]''::jsonb),
              ''Informesanas_atgadinajumi'', coalesce("Informesanas_atgadinajumi", ''{}''::jsonb)
            ) from public.%I where "IAD.id"::text = $1',
            v_relname
          )
          into v_result
          using p_row_id;
        else
          execute format(
            'select jsonb_build_object(
              ''ok'', true,
              ''Informesanas_auditu_vesture'', coalesce("Informesanas_auditu_vesture", ''[]''::jsonb),
              ''Informesanas_sanemtaji'', coalesce("Informesanas_sanemtaji", ''[]''::jsonb),
              ''Informesanas_atgadinajumi'', coalesce("Informesanas_atgadinajumi", ''{}''::jsonb)
            ) from public.%I where %I::text = $1',
            v_relname,
            v_id_col
          )
          into v_result
          using p_row_id;
        end if;
        return coalesce(v_result, jsonb_build_object('ok', true));
      end if;
    exception
      when undefined_column then
        continue;
    end;
  end loop;

  return jsonb_build_object('ok', false, 'reason', 'row_not_found');
end;
$$;

revoke all on function public.pdd_iad_patch_informesanas(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.pdd_iad_patch_informesanas(text, jsonb, jsonb, jsonb) to anon, authenticated, service_role;

comment on function public.pdd_iad_patch_informesanas(text, jsonb, jsonb, jsonb) is
  'PDD: papildina IaD informēšanas kolonnas (auditācija, saņēmēji, atgādinājumi) pēc rindas id.';
