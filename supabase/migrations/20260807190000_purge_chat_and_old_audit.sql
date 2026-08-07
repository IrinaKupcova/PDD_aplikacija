-- Dzēš čata datus un veco auditācijas vēsturi (pirms iepriekšējā mēneša sākuma).
-- Neaizskar Pakalpojumu/Procesu/prombūtņu/aktualitāšu tabulas.

begin;

do $$
begin
  if to_regclass('public.pdd_ideju_chat_reactions') is not null then
    truncate table public.pdd_ideju_chat_reactions;
  end if;
  if to_regclass('public.pdd_ideju_chat') is not null then
    truncate table public.pdd_ideju_chat;
  end if;
end $$;

do $$
declare
  cutoff timestamptz := (date_trunc('month', current_date) - interval '1 month');
begin
  if to_regclass('public."Auditacijas_vesture"') is not null then
    begin
      execute format('delete from public.%I where ts < $1', 'Auditacijas_vesture') using cutoff;
    exception when undefined_column then
      begin
        execute format('delete from public.%I where created_at < $1', 'Auditacijas_vesture') using cutoff;
      exception when undefined_column then
        begin
          execute format('delete from public.%I where %I < $1', 'Auditacijas_vesture', 'Laiks') using cutoff;
        exception when others then
          raise notice 'Auditacijas_vesture purge skip: %', sqlerrm;
        end;
      end;
    end;
  end if;

  if to_regclass('public."Auditacijas_vēsture"') is not null then
    begin
      execute format('delete from public.%I where ts < $1', 'Auditacijas_vēsture') using cutoff;
    exception when undefined_column then
      begin
        execute format('delete from public.%I where created_at < $1', 'Auditacijas_vēsture') using cutoff;
      exception when undefined_column then
        begin
          execute format('delete from public.%I where %I < $1', 'Auditacijas_vēsture', 'Laiks') using cutoff;
        exception when others then
          raise notice 'Auditacijas_vēsture purge skip: %', sqlerrm;
        end;
      end;
    end;
  end if;
end $$;

commit;
