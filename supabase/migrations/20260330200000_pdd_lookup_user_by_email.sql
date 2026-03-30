-- Ātrā e-pasta ieeja no lapas (anon / bez Supabase Auth JWT): atrod lietotāja ID pēc e-pasta.
-- RLS uz public.users bloķē tiešo SELECT anon loman — šī funkcija darbojas kā security definer.

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
  limit 1;
end;
$$;

comment on function public.pdd_lookup_user_by_email(text) is
  'PDD: atgriež public.users.id pēc darba e-pasta (tiešai ieejai bez paroles).';

revoke all on function public.pdd_lookup_user_by_email(text) from public;
grant execute on function public.pdd_lookup_user_by_email(text) to anon, authenticated;
