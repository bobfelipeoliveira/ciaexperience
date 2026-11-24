-- =====================================================================
-- CIA EXPERIENCE — 002 · MÓDULO COLETAS DE URINA
-- Execute DEPOIS do 001. Idempotente.
-- Todas as tabelas deste módulo começam com "urine_collection_".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lotes de importação (planilha) — criado antes por causa da FK
-- ---------------------------------------------------------------------
create table if not exists public.urine_collection_import_batches (
  id                  uuid primary key default gen_random_uuid(),
  file_name           text not null,
  sheet_name          text not null,
  total_rows          int not null default 0,
  inserted_rows       int not null default 0,
  duplicate_rows      int not null default 0,
  error_rows          int not null default 0,
  report              jsonb,
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  finished_at         timestamptz
);

-- ---------------------------------------------------------------------
-- 2. Solicitações de coleta
-- ---------------------------------------------------------------------
create table if not exists public.urine_collection_requests (
  id                       uuid primary key default gen_random_uuid(),

  -- A. Identificação
  patient_name             text not null check (char_length(btrim(patient_name)) between 2 and 200),
  patient_age              int check (patient_age between 0 and 130),
  health_plan              text check (char_length(health_plan) <= 120),
  collection_method        text check (collection_method in ('CVA','CVD')),

  -- B/C. Origem e prioridade (independentes)
  origin                   text check (origin in ('INTERCORRENCIA','TICKET_ELETIVO','DEMANDA_EXTERNA')),
  priority                 text check (priority in ('ELETIVA','URGENTE','EMERGENCIAL')),
  emergency_justification  text check (char_length(emergency_justification) <= 1000),

  -- D. Material na residência
  material_available       text check (material_available in ('SIM','NAO','NAO_CONFIRMADO')),
  material_responsible     text check (char_length(material_responsible) <= 150),
  material_deadline        date,

  -- E. Agendamento
  received_date            date,
  receipt_shift            text check (receipt_shift in ('DIURNO','NOTURNO')),
  scheduled_date           date,
  original_scheduled_date  date,
  scheduled_period         text check (scheduled_period in ('MANHA','TARDE','NOITE','HORARIO','QUALQUER')),
  scheduled_time           time,
  family_contact_name      text check (char_length(family_contact_name) <= 150),
  contact_phone            text check (char_length(contact_phone) <= 60),
  scheduler_name           text check (char_length(scheduler_name) <= 150),
  scheduler_user_id        uuid references auth.users(id) on delete set null,

  -- F. Endereço (CEP NÃO é obrigatório)
  address_raw              text check (char_length(address_raw) <= 500),
  address_street           text check (char_length(address_street) <= 200),
  address_number           text check (char_length(address_number) <= 20),
  address_complement       text check (char_length(address_complement) <= 120),
  neighborhood             text check (char_length(neighborhood) <= 120),
  city                     text check (char_length(city) <= 120),
  state                    text check (state ~ '^[A-Z]{2}$'),
  cep                      text check (cep ~ '^[0-9]{5}-?[0-9]{3}$'),
  address_reference        text check (char_length(address_reference) <= 300),
  latitude                 numeric(9,6) check (latitude between -90 and 90),
  longitude                numeric(9,6) check (longitude between -180 and 180),
  geo_precision            text check (geo_precision in ('BAIRRO','MUNICIPIO','ENDERECO','MANUAL')),
  geo_source               text check (char_length(geo_source) <= 80),

  -- G. Reagendamento (histórico completo em urine_collection_reschedules)
  needs_reschedule         boolean,
  reschedule_count         int not null default 0,

  -- Logística
  route_support            boolean,                       -- "SUPORTE ROTA" da planilha
  assigned_nurse_name      text check (char_length(assigned_nurse_name) <= 150),

  -- H. Execução
  nurse_name               text check (char_length(nurse_name) <= 150),
  collected_date           date,
  status                   text not null default 'RECEBIDA' check (status in (
                             'RECEBIDA','AGUARDANDO_CONFIRMACAO','AGUARDANDO_MATERIAL','AGENDADA',
                             'EM_EXECUCAO','REALIZADA','REAGENDADA','CANCELADA','NAO_REALIZADA',
                             'PENDENTE_INFORMACAO')),
  status_reason            text check (char_length(status_reason) <= 1000),
  outcome                  text check (char_length(outcome) <= 1000),
  notes                    text check (char_length(notes) <= 4000),
  legacy_notes             text,                          -- observação original da planilha (preservada)

  -- Controle
  entry_mode               text not null default 'FORMULARIO' check (entry_mode in ('TEXTO_LIVRE','FORMULARIO','IMPORTACAO')),
  patient_name_norm        text,
  phone_digits             text,
  import_batch_id          uuid references public.urine_collection_import_batches(id) on delete set null,
  import_key               text unique,
  legacy_data              jsonb,
  archived_at              timestamptz,
  archived_by              uuid references auth.users(id) on delete set null,
  archive_reason           text check (char_length(archive_reason) <= 500),
  created_at               timestamptz not null default now(),
  created_by               uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at               timestamptz not null default now(),
  updated_by               uuid references auth.users(id) on delete set null,
  status_changed_at        timestamptz not null default now(),

  -- Regras de negócio validadas NO BANCO
  constraint ucr_emergency_justification check (
    priority is distinct from 'EMERGENCIAL'
    or char_length(btrim(coalesce(emergency_justification, ''))) >= 5),
  constraint ucr_done_requires_date check (status <> 'REALIZADA' or collected_date is not null),
  constraint ucr_cancel_requires_reason check (
    status not in ('CANCELADA','NAO_REALIZADA')
    or entry_mode = 'IMPORTACAO'
    or char_length(btrim(coalesce(status_reason, ''))) >= 3),
  constraint ucr_time_requires_period check (scheduled_time is null or scheduled_period = 'HORARIO')
);

create index if not exists ucr_scheduled_idx   on public.urine_collection_requests (scheduled_date);
create index if not exists ucr_status_idx      on public.urine_collection_requests (status);
create index if not exists ucr_priority_idx    on public.urine_collection_requests (priority);
create index if not exists ucr_city_idx        on public.urine_collection_requests (city);
create index if not exists ucr_neigh_idx       on public.urine_collection_requests (neighborhood);
create index if not exists ucr_method_idx      on public.urine_collection_requests (collection_method);
create index if not exists ucr_scheduler_idx   on public.urine_collection_requests (scheduler_name);
create index if not exists ucr_created_by_idx  on public.urine_collection_requests (created_by);
create index if not exists ucr_received_idx    on public.urine_collection_requests (received_date);
create index if not exists ucr_patient_idx     on public.urine_collection_requests (patient_name_norm);
create index if not exists ucr_phone_idx       on public.urine_collection_requests (phone_digits);
create index if not exists ucr_active_idx      on public.urine_collection_requests (scheduled_date, status) where archived_at is null;

-- ---------------------------------------------------------------------
-- 3. Histórico de reagendamentos (nunca sobrescreve)
-- ---------------------------------------------------------------------
create table if not exists public.urine_collection_reschedules (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null references public.urine_collection_requests(id) on delete cascade,
  original_date    date,
  new_date         date,
  new_period       text check (new_period in ('MANHA','TARDE','NOITE','HORARIO','QUALQUER')),
  reason           text not null check (char_length(btrim(reason)) between 3 and 1000),
  changed_by       uuid default auth.uid() references auth.users(id) on delete set null,
  changed_by_name  text,
  changed_at       timestamptz not null default now(),
  source           text not null default 'SISTEMA' check (source in ('SISTEMA','IMPORTACAO'))
);
create index if not exists ucrs_request_idx on public.urine_collection_reschedules (request_id, changed_at desc);

-- ---------------------------------------------------------------------
-- 4. Anexos (arquivo fica no Storage PRIVADO; aqui só os metadados)
-- ---------------------------------------------------------------------
create table if not exists public.urine_collection_attachments (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.urine_collection_requests(id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null check (char_length(file_name) between 1 and 200),
  mime_type     text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  category      text not null default 'OUTRO' check (category in ('PEDIDO_MEDICO','SOLICITACAO_EXAME','DOCUMENTO','OUTRO')),
  uploaded_by   uuid default auth.uid() references auth.users(id) on delete set null,
  uploaded_by_name text,
  uploaded_at   timestamptz not null default now(),
  constraint uca_path_matches_request check (split_part(storage_path, '/', 1) = request_id::text)
);
create index if not exists uca_request_idx on public.urine_collection_attachments (request_id);

-- ---------------------------------------------------------------------
-- 5. Histórico de exportações
-- ---------------------------------------------------------------------
create table if not exists public.urine_collection_export_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users(id) on delete set null,
  user_name   text,
  format      text not null check (format in ('XLSX','CSV')),
  layout      text not null check (layout in ('ORIGINAL','AMPLIADA')),
  filters     jsonb,
  row_count   int not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Gatilho de consistência das solicitações
-- ---------------------------------------------------------------------
create or replace function public.urine_request_before_write()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_is_coord boolean := public.has_module_role('urine_collection', array['coordenacao']);
begin
  -- normalizações para busca / duplicidade
  new.patient_name      := btrim(regexp_replace(new.patient_name, '\s+', ' ', 'g'));
  new.patient_name_norm := public.norm(new.patient_name);
  new.phone_digits      := nullif(regexp_replace(coalesce(new.contact_phone, ''), '\D', '', 'g'), '');
  if new.state is not null then new.state := upper(new.state); end if;
  if new.scheduled_period is distinct from 'HORARIO' then new.scheduled_time := null; end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.updated_by := auth.uid();
    new.created_at := now();
    new.status_changed_at := now();
    if new.import_key is not null and auth.uid() is not null and not public.is_admin() then
      raise exception 'Somente administradores podem importar registros.' using errcode = '42501';
    end if;
    if new.archived_at is not null and auth.uid() is not null and not v_is_coord then
      raise exception 'Sem permissão para arquivar.' using errcode = '42501';
    end if;
  else
    -- campos imutáveis
    new.id := old.id; new.created_by := old.created_by; new.created_at := old.created_at;
    new.import_key := old.import_key; new.import_batch_id := old.import_batch_id;
    new.legacy_data := old.legacy_data; new.legacy_notes := old.legacy_notes; new.entry_mode := old.entry_mode;
    new.updated_by := auth.uid();
    if new.status is distinct from old.status then new.status_changed_at := now(); end if;
    -- arquivamento só pela coordenação/admin
    if (new.archived_at is distinct from old.archived_at) and auth.uid() is not null and not v_is_coord then
      raise exception 'Somente coordenação ou administração podem arquivar/desarquivar.' using errcode = '42501';
    end if;
    if new.archived_at is not null and old.archived_at is null then new.archived_by := auth.uid(); end if;
    if new.archived_at is null then new.archived_by := null; new.archive_reason := null; end if;
    -- a data agendada só muda pelo fluxo de reagendamento (preserva histórico),
    -- exceto quando ainda não havia data.
    if old.scheduled_date is not null and new.scheduled_date is distinct from old.scheduled_date
       and coalesce(current_setting('cia.rescheduling', true), '') <> 'on'
       and not public.is_admin() then
      raise exception 'Para alterar uma data já agendada, utilize "Reagendar" (o histórico é preservado).';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ucr_before_write on public.urine_collection_requests;
create trigger ucr_before_write before insert or update on public.urine_collection_requests
  for each row execute function public.urine_request_before_write();

drop trigger if exists ucr_touch on public.urine_collection_requests;
create trigger ucr_touch before update on public.urine_collection_requests
  for each row execute function public.touch_updated_at();

-- Notificação de emergência (sem repetição: uma por solicitação)
create or replace function public.urine_request_after_write()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.priority = 'EMERGENCIAL' and new.archived_at is null
     and new.status not in ('REALIZADA','CANCELADA','NAO_REALIZADA')
     and (tg_op = 'INSERT' or old.priority is distinct from 'EMERGENCIAL') then
    perform public.notify_users(
      public.module_staff_ids('urine_collection', array['coordenacao']),
      'urine_collection', 'urine_emergency', 'critical',
      'Coleta EMERGENCIAL registrada',
      'Paciente ' || new.patient_name || coalesce(' — agendada para ' || to_char(new.scheduled_date, 'DD/MM/YYYY'), ' — sem data definida') || '.',
      '/coletas/' || new.id::text, 'urine_emergency:' || new.id::text);
  end if;
  return new;
end $$;

drop trigger if exists ucr_after_write on public.urine_collection_requests;
create trigger ucr_after_write after insert or update of priority on public.urine_collection_requests
  for each row execute function public.urine_request_after_write();

-- Auditoria
drop trigger if exists audit_ucr on public.urine_collection_requests;
create trigger audit_ucr after insert or update or delete on public.urine_collection_requests
  for each row execute function public.audit_row_change('urine_collection');
drop trigger if exists audit_ucrs on public.urine_collection_reschedules;
create trigger audit_ucrs after insert or update or delete on public.urine_collection_reschedules
  for each row execute function public.audit_row_change('urine_collection');
drop trigger if exists audit_uca on public.urine_collection_attachments;
create trigger audit_uca after insert or update or delete on public.urine_collection_attachments
  for each row execute function public.audit_row_change('urine_collection');
drop trigger if exists audit_ucel on public.urine_collection_export_logs;
create trigger audit_ucel after insert on public.urine_collection_export_logs
  for each row execute function public.audit_row_change('urine_collection');
drop trigger if exists audit_ucib on public.urine_collection_import_batches;
create trigger audit_ucib after insert or update on public.urine_collection_import_batches
  for each row execute function public.audit_row_change('urine_collection');

-- Carimbos de nome (para exibição sem expor a tabela de perfis)
create or replace function public.stamp_actor_name()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_name text;
begin
  select full_name into v_name from public.profiles where id = auth.uid();
  if tg_table_name = 'urine_collection_reschedules' then
    new.changed_by := coalesce(auth.uid(), new.changed_by);
    new.changed_by_name := coalesce(v_name, new.changed_by_name);
    new.changed_at := case when new.source = 'IMPORTACAO' then new.changed_at else now() end;
  elsif tg_table_name = 'urine_collection_attachments' then
    new.uploaded_by := auth.uid(); new.uploaded_by_name := v_name; new.uploaded_at := now();
  elsif tg_table_name = 'urine_collection_export_logs' then
    new.user_id := auth.uid(); new.user_name := v_name; new.created_at := now();
  end if;
  return new;
end $$;

drop trigger if exists ucrs_stamp on public.urine_collection_reschedules;
create trigger ucrs_stamp before insert on public.urine_collection_reschedules
  for each row execute function public.stamp_actor_name();
drop trigger if exists uca_stamp on public.urine_collection_attachments;
create trigger uca_stamp before insert on public.urine_collection_attachments
  for each row execute function public.stamp_actor_name();
drop trigger if exists ucel_stamp on public.urine_collection_export_logs;
create trigger ucel_stamp before insert on public.urine_collection_export_logs
  for each row execute function public.stamp_actor_name();

-- ---------------------------------------------------------------------
-- 7. Regras de permissão do módulo
-- ---------------------------------------------------------------------
create or replace function public.urine_can_edit(p_created_by uuid, p_archived timestamptz)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select public.has_module_role('urine_collection', array['coordenacao'])
      or (public.has_module_role('urine_collection', array['tecnica'])
          and p_archived is null
          and (p_created_by = auth.uid()
               or coalesce((public.get_setting('urine.tecnica_can_edit_all'))::text, 'false') = 'true'))
$$;

create or replace function public.urine_can_read_request(p_request uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.urine_collection_requests r
    where r.id = p_request
      and public.can_access_module('urine_collection')
      and (r.archived_at is null or public.has_module_role('urine_collection', array['coordenacao']))
  )
$$;

create or replace function public.urine_can_edit_request(p_request uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.urine_collection_requests r
    where r.id = p_request and public.urine_can_edit(r.created_by, r.archived_at)
  )
$$;

alter table public.urine_collection_requests      enable row level security;
alter table public.urine_collection_reschedules   enable row level security;
alter table public.urine_collection_attachments   enable row level security;
alter table public.urine_collection_export_logs   enable row level security;
alter table public.urine_collection_import_batches enable row level security;

revoke all on public.urine_collection_requests, public.urine_collection_reschedules,
              public.urine_collection_attachments, public.urine_collection_export_logs,
              public.urine_collection_import_batches from anon, authenticated;

grant select, insert, update, delete on public.urine_collection_requests to authenticated;
grant select, insert, delete on public.urine_collection_reschedules to authenticated;
grant select, insert, delete on public.urine_collection_attachments to authenticated;
grant select, insert on public.urine_collection_export_logs to authenticated;
grant select, insert, update on public.urine_collection_import_batches to authenticated;

-- Solicitações
drop policy if exists ucr_select on public.urine_collection_requests;
create policy ucr_select on public.urine_collection_requests for select to authenticated
  using (public.can_access_module('urine_collection')
         and (archived_at is null or public.has_module_role('urine_collection', array['coordenacao'])));
drop policy if exists ucr_insert on public.urine_collection_requests;
create policy ucr_insert on public.urine_collection_requests for insert to authenticated
  with check (public.can_access_module('urine_collection'));
drop policy if exists ucr_update on public.urine_collection_requests;
create policy ucr_update on public.urine_collection_requests for update to authenticated
  using (public.urine_can_edit(created_by, archived_at))
  with check (public.can_access_module('urine_collection'));
drop policy if exists ucr_delete on public.urine_collection_requests;
create policy ucr_delete on public.urine_collection_requests for delete to authenticated
  using (public.is_admin());

-- Reagendamentos
drop policy if exists ucrs_select on public.urine_collection_reschedules;
create policy ucrs_select on public.urine_collection_reschedules for select to authenticated
  using (public.urine_can_read_request(request_id));
drop policy if exists ucrs_insert on public.urine_collection_reschedules;
create policy ucrs_insert on public.urine_collection_reschedules for insert to authenticated
  with check (public.urine_can_edit_request(request_id));
drop policy if exists ucrs_delete on public.urine_collection_reschedules;
create policy ucrs_delete on public.urine_collection_reschedules for delete to authenticated
  using (public.is_admin());

-- Anexos
drop policy if exists uca_select on public.urine_collection_attachments;
create policy uca_select on public.urine_collection_attachments for select to authenticated
  using (public.urine_can_read_request(request_id));
drop policy if exists uca_insert on public.urine_collection_attachments;
create policy uca_insert on public.urine_collection_attachments for insert to authenticated
  with check (public.urine_can_read_request(request_id) and public.can_access_module('urine_collection'));
drop policy if exists uca_delete on public.urine_collection_attachments;
create policy uca_delete on public.urine_collection_attachments for delete to authenticated
  using (public.has_module_role('urine_collection', array['coordenacao'])
         or (uploaded_by = auth.uid() and public.urine_can_edit_request(request_id)));

-- Exportações (coordenação e admin)
drop policy if exists ucel_select on public.urine_collection_export_logs;
create policy ucel_select on public.urine_collection_export_logs for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
drop policy if exists ucel_insert on public.urine_collection_export_logs;
create policy ucel_insert on public.urine_collection_export_logs for insert to authenticated
  with check (public.has_module_role('urine_collection', array['coordenacao']));

-- Importações (somente admin)
drop policy if exists ucib_all_select on public.urine_collection_import_batches;
create policy ucib_all_select on public.urine_collection_import_batches for select to authenticated using (public.is_admin());
drop policy if exists ucib_insert on public.urine_collection_import_batches;
create policy ucib_insert on public.urine_collection_import_batches for insert to authenticated with check (public.is_admin());
drop policy if exists ucib_update on public.urine_collection_import_batches;
create policy ucib_update on public.urine_collection_import_batches for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Reagendar (atômico: atualiza a solicitação + grava histórico)
-- ---------------------------------------------------------------------
create or replace function public.urine_reschedule(
  p_request uuid, p_new_date date, p_reason text,
  p_new_period text default null, p_new_time time default null)
returns void language plpgsql security invoker
set search_path = ''
as $$
declare v_old date;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo do reagendamento.'; end if;
  if p_new_date is null then raise exception 'Informe a nova data.'; end if;
  if p_new_date < public.today_sp() - 1 then raise exception 'A nova data não pode estar no passado.'; end if;

  select scheduled_date into v_old from public.urine_collection_requests where id = p_request for update;
  if not found then raise exception 'Solicitação não encontrada ou sem permissão.' using errcode = '42501'; end if;

  perform set_config('cia.rescheduling', 'on', true);
  update public.urine_collection_requests
     set original_scheduled_date = coalesce(original_scheduled_date, v_old),
         scheduled_date = p_new_date,
         scheduled_period = coalesce(p_new_period, scheduled_period),
         scheduled_time = case when coalesce(p_new_period, scheduled_period) = 'HORARIO' then coalesce(p_new_time, scheduled_time) else null end,
         needs_reschedule = true,
         reschedule_count = reschedule_count + 1,
         status = case when v_old is null then 'AGENDADA' else 'REAGENDADA' end
   where id = p_request;
  if not found then raise exception 'Sem permissão para reagendar esta solicitação.' using errcode = '42501'; end if;
  perform set_config('cia.rescheduling', 'off', true);

  insert into public.urine_collection_reschedules (request_id, original_date, new_date, new_period, reason)
  values (p_request, v_old, p_new_date, p_new_period, btrim(p_reason));
end $$;

-- ---------------------------------------------------------------------
-- 9. Possíveis duplicidades
-- ---------------------------------------------------------------------
create or replace function public.urine_find_duplicates(p_patient text, p_phone text default null, p_exclude uuid default null)
returns table (id uuid, patient_name text, scheduled_date date, status text, received_date date, neighborhood text, match text)
language sql stable security invoker
set search_path = ''
as $$
  select r.id, r.patient_name, r.scheduled_date, r.status, r.received_date, r.neighborhood,
         case when r.patient_name_norm = public.norm(p_patient) then 'NOME' else 'TELEFONE' end
  from public.urine_collection_requests r
  where r.archived_at is null
    and (p_exclude is null or r.id <> p_exclude)
    and r.status not in ('REALIZADA','CANCELADA','NAO_REALIZADA')
    and (
      (public.norm(p_patient) is not null and r.patient_name_norm = public.norm(p_patient))
      or (char_length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 8
          and r.phone_digits = regexp_replace(p_phone, '\D', '', 'g'))
    )
  order by r.created_at desc
  limit 10
$$;

-- ---------------------------------------------------------------------
-- 10. ALERTAS OPERACIONAIS (calculados em tempo real, fuso America/Sao_Paulo)
--     Um alerta por tipo, com a lista de solicitações que o compõem.
--     Agenda ATIVA = não arquivada, com data, e status fora de
--     REALIZADA/CANCELADA/NAO_REALIZADA.
-- ---------------------------------------------------------------------
create or replace function public.urine_alerts()
returns table (kind text, severity text, title text, message text, request_ids uuid[], total int)
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_today date := public.today_sp();
  v_tomorrow date := public.today_sp() + 1;
  v_threshold int := coalesce((public.get_setting('urine.volume_alert_threshold'))::text::int, 3);
  v_stale int := coalesce((public.get_setting('urine.stale_hours'))::text::int, 48);
  v_ids uuid[];
  c record;
begin
  if not public.can_access_module('urine_collection') then return; end if;

  for c in
    with a as (
      select r.* from public.urine_collection_requests r
      where r.archived_at is null and r.status not in ('REALIZADA','CANCELADA','NAO_REALIZADA')
    ), dup as (
      select patient_name_norm from a group by patient_name_norm having count(*) > 1
    )
    select 1 ord, 'VOLUME_AMANHA' k, 'critical' sev, 'ALERTA OPERACIONAL' tit,
           array_agg(id order by scheduled_date) ids from a where scheduled_date = v_tomorrow
    union all select 2, 'EMERGENCIAL', 'critical', 'Coletas emergenciais em aberto', array_agg(id) from a where priority = 'EMERGENCIAL'
    union all select 3, 'ATRASADA', 'critical', 'Coletas atrasadas', array_agg(id) from a where scheduled_date < v_today
    union all select 4, 'SEM_MATERIAL', 'warning', 'Falta de material na residência', array_agg(id) from a where material_available = 'NAO'
    union all select 5, 'MATERIAL_NAO_CONFIRMADO', 'warning', 'Material não confirmado', array_agg(id) from a
               where material_available = 'NAO_CONFIRMADO' or material_available is null
    union all select 6, 'CONFIRMACAO_FAMILIAR', 'warning', 'Confirmação familiar pendente', array_agg(id) from a
               where scheduled_date is not null and (status = 'AGUARDANDO_CONFIRMACAO' or family_contact_name is null)
    union all select 7, 'ENDERECO_INCOMPLETO', 'warning', 'Endereço incompleto', array_agg(id) from a
               where neighborhood is null or city is null or (address_street is null and address_raw is null)
    union all select 8, 'DUPLICADO', 'warning', 'Possível agendamento duplicado', array_agg(id) from a
               where patient_name_norm in (select patient_name_norm from dup)
    union all select 9, 'SEM_RESPONSAVEL', 'warning', 'Coleta sem profissional designado', array_agg(id) from a
               where scheduled_date between v_today and v_tomorrow and assigned_nurse_name is null
    union all select 10, 'REAGENDAMENTO', 'info', 'Coletas reagendadas', array_agg(id) from a
               where status = 'REAGENDADA' and scheduled_date >= v_today
    union all select 11, 'SEM_ATUALIZACAO', 'info', 'Solicitações sem atualização', array_agg(id) from a
               where updated_at < now() - make_interval(hours => v_stale)
    order by 1
  loop
    v_ids := c.ids;
    continue when v_ids is null;
    continue when c.k = 'VOLUME_AMANHA' and array_length(v_ids, 1) <= v_threshold;
    kind := c.k; severity := c.sev; title := c.tit; request_ids := v_ids; total := array_length(v_ids, 1);
    message := case c.k
      when 'VOLUME_AMANHA' then 'Existem ' || total || ' coletas programadas para amanhã (' || to_char(v_tomorrow, 'DD/MM')
                                || '). Avalie a distribuição e a logística.'
      when 'EMERGENCIAL' then total || ' solicitação(ões) EMERGENCIAL(IS) aguardando execução.'
      when 'ATRASADA' then total || ' coleta(s) com data agendada vencida e sem registro de realização.'
      when 'SEM_MATERIAL' then total || ' solicitação(ões) sem material disponível na residência. Providenciar.'
      when 'MATERIAL_NAO_CONFIRMADO' then total || ' solicitação(ões) sem confirmação de material (potinho) na residência.'
      when 'CONFIRMACAO_FAMILIAR' then total || ' agendamento(s) sem confirmação registrada do familiar.'
      when 'ENDERECO_INCOMPLETO' then total || ' solicitação(ões) sem bairro, cidade ou logradouro.'
      when 'DUPLICADO' then total || ' solicitações em aberto compartilham o mesmo paciente.'
      when 'SEM_RESPONSAVEL' then total || ' coleta(s) para hoje/amanhã sem profissional previsto.'
      when 'REAGENDAMENTO' then total || ' coleta(s) reagendada(s) aguardando execução.'
      else total || ' solicitação(ões) em aberto sem atualização há mais de ' || v_stale || ' horas.'
    end;
    return next;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 11. Importação da planilha (somente admin, sem duplicar)
--     p_rows: array JSON já mapeado e revisado na tela de importação.
-- ---------------------------------------------------------------------
create or replace function public.urine_import_rows(p_batch uuid, p_rows jsonb)
returns jsonb language plpgsql security invoker
set search_path = ''
as $$
declare
  r jsonb; v_id uuid; v_ins int := 0; v_dup int := 0; v_err int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Lote inválido (máximo de 1000 linhas por envio).';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if exists (select 1 from public.urine_collection_requests where import_key = r->>'import_key') then
        v_dup := v_dup + 1; continue;
      end if;
      insert into public.urine_collection_requests (
        patient_name, collection_method, origin, material_available, received_date, receipt_shift,
        scheduled_date, original_scheduled_date, family_contact_name, contact_phone, scheduler_name,
        health_plan, neighborhood, city, needs_reschedule, reschedule_count, route_support, nurse_name, collected_date,
        status, legacy_notes, entry_mode, import_batch_id, import_key, legacy_data)
      values (
        r->>'patient_name', r->>'collection_method', r->>'origin', r->>'material_available',
        (r->>'received_date')::date, r->>'receipt_shift',
        (r->>'scheduled_date')::date, (r->>'original_scheduled_date')::date,
        r->>'family_contact_name', r->>'contact_phone', r->>'scheduler_name',
        r->>'health_plan', r->>'neighborhood', r->>'city', (r->>'needs_reschedule')::boolean,
        case when (r->>'original_scheduled_date') is not null then 1 else 0 end,
        (r->>'route_support')::boolean, r->>'nurse_name', (r->>'collected_date')::date,
        coalesce(r->>'status', 'RECEBIDA'), r->>'legacy_notes', 'IMPORTACAO', p_batch, r->>'import_key', r->'legacy_data')
      returning id into v_id;

      if (r->>'original_scheduled_date') is not null then
        insert into public.urine_collection_reschedules (request_id, original_date, new_date, reason, source, changed_at)
        values (v_id, (r->>'original_scheduled_date')::date, (r->>'scheduled_date')::date,
                'Reagendamento registrado na planilha de origem (importação).', 'IMPORTACAO', now());
      end if;
      v_ins := v_ins + 1;
    exception when others then
      v_err := v_err + 1;
      v_errors := v_errors || jsonb_build_object('row', r->'legacy_data'->>'linha', 'error', sqlerrm);
    end;
  end loop;

  update public.urine_collection_import_batches
     set inserted_rows = inserted_rows + v_ins, duplicate_rows = duplicate_rows + v_dup,
         error_rows = error_rows + v_err,
         report = coalesce(report, '[]'::jsonb) || v_errors, finished_at = now()
   where id = p_batch;

  return jsonb_build_object('inserted', v_ins, 'duplicates', v_dup, 'errors', v_err, 'error_list', v_errors);
end $$;

revoke execute on function public.urine_request_before_write() from public, anon, authenticated;
revoke execute on function public.urine_request_after_write() from public, anon, authenticated;
revoke execute on function public.stamp_actor_name() from public, anon, authenticated;
revoke execute on function public.urine_reschedule(uuid, date, text, text, time) from public, anon;
revoke execute on function public.urine_find_duplicates(text, text, uuid) from public, anon;
revoke execute on function public.urine_alerts() from public, anon;
revoke execute on function public.urine_import_rows(uuid, jsonb) from public, anon;
grant execute on function public.urine_reschedule(uuid, date, text, text, time),
  public.urine_find_duplicates(text, text, uuid), public.urine_alerts(),
  public.urine_import_rows(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 12. Tempo real (o painel e os alertas se atualizam sozinhos)
--     O Realtime respeita o RLS: cada pessoa só recebe o que pode ver.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public'
                       and tablename = 'urine_collection_requests') then
    alter publication supabase_realtime add table public.urine_collection_requests;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public'
                       and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
