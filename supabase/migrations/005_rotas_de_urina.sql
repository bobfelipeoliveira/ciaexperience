-- =====================================================================
-- CIA EXPERIENCE — 005 · ROTAS DE URINA (logística territorial)
-- Execute DEPOIS do 001 a 004. Idempotente.
--
-- O sistema SUGERE pequenas rotas por região/bairros próximos; o(a)
-- enfermeiro(a) líder do dia (perfil Coordenação) revisa, escolhe o
-- profissional e VALIDA. Nada é atribuído sem validação humana.
-- =====================================================================

-- Parâmetros da logística (ajustáveis em Configurações → Regras da operação)
insert into public.system_settings (key, value, description) values
  ('urine.route_max_stops', '4'::jsonb, 'Máximo de coletas por rota.'),
  ('urine.route_start_time', '"07:30"'::jsonb, 'Horário de saída da base.'),
  ('urine.route_deadline', '"11:00"'::jsonb, 'Horário-limite para terminar a rota (entrega no laboratório).'),
  ('urine.route_base', 'null'::jsonb, 'Base de saída das rotas: {"label": "...", "lat": -22.9, "lng": -43.2}.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Rotas
-- ---------------------------------------------------------------------
create table if not exists public.urine_collection_routes (
  id                 uuid primary key default gen_random_uuid(),
  route_date         date not null,
  name               text not null check (char_length(btrim(name)) between 2 and 120),
  region             text check (char_length(region) <= 120),
  status             text not null default 'RASCUNHO' check (status in ('RASCUNHO','VALIDADA','CANCELADA')),
  nurse_name         text check (char_length(nurse_name) <= 150),
  start_time         time,
  notes              text check (char_length(notes) <= 2000),
  est_distance_km    numeric(7,1),
  est_duration_min   int,
  validated_by       uuid references auth.users(id) on delete set null,
  validated_by_name  text,
  validated_at       timestamptz,
  created_by         uuid default auth.uid() references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists ucro_date_idx on public.urine_collection_routes (route_date, status);

create table if not exists public.urine_collection_route_stops (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.urine_collection_routes(id) on delete cascade,
  request_id  uuid not null references public.urine_collection_requests(id) on delete cascade,
  seq         int not null check (seq between 1 and 50),
  eta         time,
  leg_km      numeric(6,1),
  constraint ucrs_one_route_per_request unique (request_id),
  constraint ucrs_unique_seq unique (route_id, seq)
);
create index if not exists ucrst_route_idx on public.urine_collection_route_stops (route_id, seq);

drop trigger if exists ucro_touch on public.urine_collection_routes;
create trigger ucro_touch before update on public.urine_collection_routes
  for each row execute function public.touch_updated_at();

drop trigger if exists audit_ucro on public.urine_collection_routes;
create trigger audit_ucro after insert or update or delete on public.urine_collection_routes
  for each row execute function public.audit_row_change('urine_collection');
drop trigger if exists audit_ucrst on public.urine_collection_route_stops;
create trigger audit_ucrst after insert or delete on public.urine_collection_route_stops
  for each row execute function public.audit_row_change('urine_collection');

-- ---------------------------------------------------------------------
-- Permissões: todos do módulo VEEM as rotas; só Coordenação (líder) altera
-- ---------------------------------------------------------------------
alter table public.urine_collection_routes enable row level security;
alter table public.urine_collection_route_stops enable row level security;
revoke all on public.urine_collection_routes, public.urine_collection_route_stops from anon, authenticated;
grant select, insert, update, delete on public.urine_collection_routes, public.urine_collection_route_stops to authenticated;

drop policy if exists ucro_select on public.urine_collection_routes;
create policy ucro_select on public.urine_collection_routes for select to authenticated
  using (public.can_access_module('urine_collection'));
drop policy if exists ucro_write on public.urine_collection_routes;
create policy ucro_write on public.urine_collection_routes for all to authenticated
  using (public.has_module_role('urine_collection', array['coordenacao']))
  with check (public.has_module_role('urine_collection', array['coordenacao']));

drop policy if exists ucrst_select on public.urine_collection_route_stops;
create policy ucrst_select on public.urine_collection_route_stops for select to authenticated
  using (public.can_access_module('urine_collection'));
drop policy if exists ucrst_write on public.urine_collection_route_stops;
create policy ucrst_write on public.urine_collection_route_stops for all to authenticated
  using (public.has_module_role('urine_collection', array['coordenacao']))
  with check (public.has_module_role('urine_collection', array['coordenacao']));

-- ---------------------------------------------------------------------
-- Salvar rota (atômico). p = {id?, route_date, name, region, nurse_name,
--   start_time, notes, est_distance_km, est_duration_min,
--   stops: [{request_id, eta, leg_km}, ...]}  (na ordem de visita)
-- ---------------------------------------------------------------------
create or replace function public.urine_route_save(p jsonb)
returns uuid language plpgsql security invoker
set search_path = ''
as $$
declare
  v_id uuid := public.try_uuid(p->>'id');
  v_date date := (p->>'route_date')::date;
  v_status text;
  s jsonb; v_seq int := 0; v_req record;
begin
  if not public.has_module_role('urine_collection', array['coordenacao']) then
    raise exception 'Somente o(a) enfermeiro(a) líder / coordenação monta e valida rotas.' using errcode = '42501';
  end if;
  if v_date is null then raise exception 'Informe a data da rota.'; end if;
  if jsonb_typeof(p->'stops') <> 'array' or jsonb_array_length(p->'stops') = 0 then raise exception 'A rota precisa de ao menos uma coleta.'; end if;
  if jsonb_array_length(p->'stops') > 12 then raise exception 'Rota com coletas demais (máximo 12).'; end if;

  if v_id is not null then
    select status into v_status from public.urine_collection_routes where id = v_id;
    if v_status is null then raise exception 'Rota não encontrada.'; end if;
    if v_status <> 'RASCUNHO' then raise exception 'Esta rota já foi validada. Reabra-a para alterar.'; end if;
    update public.urine_collection_routes
       set route_date = v_date, name = btrim(p->>'name'), region = p->>'region',
           nurse_name = nullif(btrim(coalesce(p->>'nurse_name', '')), ''),
           start_time = (p->>'start_time')::time, notes = nullif(btrim(coalesce(p->>'notes', '')), ''),
           est_distance_km = (p->>'est_distance_km')::numeric, est_duration_min = (p->>'est_duration_min')::int
     where id = v_id;
    delete from public.urine_collection_route_stops where route_id = v_id;
  else
    insert into public.urine_collection_routes (route_date, name, region, nurse_name, start_time, notes, est_distance_km, est_duration_min)
    values (v_date, btrim(p->>'name'), p->>'region', nullif(btrim(coalesce(p->>'nurse_name', '')), ''),
            (p->>'start_time')::time, nullif(btrim(coalesce(p->>'notes', '')), ''),
            (p->>'est_distance_km')::numeric, (p->>'est_duration_min')::int)
    returning id into v_id;
  end if;

  for s in select * from jsonb_array_elements(p->'stops') loop
    v_seq := v_seq + 1;
    select r.id, r.patient_name, r.scheduled_date, r.status, r.archived_at into v_req
      from public.urine_collection_requests r where r.id = public.try_uuid(s->>'request_id');
    if v_req.id is null then raise exception 'Coleta não encontrada na rota (posição %).', v_seq; end if;
    if v_req.archived_at is not null or v_req.status in ('REALIZADA','CANCELADA','NAO_REALIZADA') then
      raise exception 'A coleta de % não está mais em aberto.', v_req.patient_name;
    end if;
    if v_req.scheduled_date is distinct from v_date then
      raise exception 'A coleta de % não está agendada para esta data.', v_req.patient_name;
    end if;
    -- se a coleta estava em outra rota ainda em rascunho, ela é movida para esta
    delete from public.urine_collection_route_stops st
     using public.urine_collection_routes ro
     where st.request_id = v_req.id and st.route_id = ro.id and ro.id <> v_id and ro.status = 'RASCUNHO';
    if exists (select 1 from public.urine_collection_route_stops where request_id = v_req.id and route_id <> v_id) then
      raise exception 'A coleta de % já está em uma rota validada.', v_req.patient_name;
    end if;
    insert into public.urine_collection_route_stops (route_id, request_id, seq, eta, leg_km)
    values (v_id, v_req.id, v_seq, (s->>'eta')::time, (s->>'leg_km')::numeric);
  end loop;

  -- rascunhos que ficaram vazios são removidos
  delete from public.urine_collection_routes ro
   where ro.status = 'RASCUNHO' and ro.route_date = v_date and ro.id <> v_id
     and not exists (select 1 from public.urine_collection_route_stops st where st.route_id = ro.id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Validar / reabrir / cancelar rota
-- VALIDADA: exige profissional; grava o profissional previsto nas coletas.
-- ---------------------------------------------------------------------
create or replace function public.urine_route_set_status(p_id uuid, p_status text)
returns void language plpgsql security invoker
set search_path = ''
as $$
declare v_route record; v_name text;
begin
  if not public.has_module_role('urine_collection', array['coordenacao']) then
    raise exception 'Somente o(a) enfermeiro(a) líder / coordenação valida rotas.' using errcode = '42501';
  end if;
  select * into v_route from public.urine_collection_routes where id = p_id for update;
  if v_route.id is null then raise exception 'Rota não encontrada.'; end if;

  if p_status = 'VALIDADA' then
    if v_route.nurse_name is null then raise exception 'Escolha o(a) profissional da rota antes de validar.'; end if;
    select full_name into v_name from public.profiles where id = auth.uid();
    update public.urine_collection_routes
       set status = 'VALIDADA', validated_by = auth.uid(), validated_by_name = v_name, validated_at = now()
     where id = p_id;
    update public.urine_collection_requests r
       set assigned_nurse_name = v_route.nurse_name
      from public.urine_collection_route_stops st
     where st.route_id = p_id and st.request_id = r.id
       and r.assigned_nurse_name is distinct from v_route.nurse_name;
  elsif p_status = 'RASCUNHO' then
    update public.urine_collection_routes
       set status = 'RASCUNHO', validated_by = null, validated_by_name = null, validated_at = null
     where id = p_id;
  elsif p_status = 'CANCELADA' then
    delete from public.urine_collection_route_stops where route_id = p_id;
    update public.urine_collection_routes set status = 'CANCELADA' where id = p_id;
  else
    raise exception 'Situação de rota inválida.';
  end if;
end $$;

revoke execute on function public.urine_route_save(jsonb) from public, anon;
revoke execute on function public.urine_route_set_status(uuid, text) from public, anon;
grant execute on function public.urine_route_save(jsonb), public.urine_route_set_status(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'urine_collection_routes') then
    alter publication supabase_realtime add table public.urine_collection_routes;
  end if;
end $$;
