-- =====================================================================
-- CIA EXPERIENCE — 004 · PRIORIDADES: somente ELETIVA e URGENTE
-- Execute DEPOIS do 001, 002 e 003. Idempotente (pode rodar de novo).
--
-- O que faz:
--  1. Converte eventuais registros "EMERGENCIAL" para "URGENTE"
--     (a mudança fica registrada na auditoria de cada registro).
--  2. O banco passa a aceitar apenas ELETIVA ou URGENTE.
--  3. Remove a exigência de justificativa (era só para emergencial).
--  4. Coletas URGENTES notificam a coordenação e entram na central de alertas.
-- =====================================================================

update public.urine_collection_requests set priority = 'URGENTE' where priority = 'EMERGENCIAL';

alter table public.urine_collection_requests drop constraint if exists ucr_emergency_justification;
alter table public.urine_collection_requests drop constraint if exists urine_collection_requests_priority_check;
alter table public.urine_collection_requests drop constraint if exists ucr_priority_check;
alter table public.urine_collection_requests
  add constraint ucr_priority_check check (priority in ('ELETIVA','URGENTE'));

-- Notificação de coleta URGENTE para a coordenação (sem repetição: uma por solicitação)
create or replace function public.urine_request_after_write()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.priority = 'URGENTE' and new.archived_at is null
     and new.status not in ('REALIZADA','CANCELADA','NAO_REALIZADA')
     and (tg_op = 'INSERT' or old.priority is distinct from 'URGENTE') then
    perform public.notify_users(
      public.module_staff_ids('urine_collection', array['coordenacao']),
      'urine_collection', 'urine_urgent', 'warning',
      'Coleta URGENTE registrada',
      'Paciente ' || new.patient_name || coalesce(' — agendada para ' || to_char(new.scheduled_date, 'DD/MM/YYYY'), ' — sem data definida') || '.',
      '/coletas/' || new.id::text, 'urine_urgent:' || new.id::text);
  end if;
  return new;
end $$;

drop trigger if exists ucr_after_write on public.urine_collection_requests;
create trigger ucr_after_write after insert or update of priority on public.urine_collection_requests
  for each row execute function public.urine_request_after_write();


-- Central de alertas (alerta "Coletas urgentes em aberto")
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
    union all select 2, 'URGENTE', 'warning', 'Coletas urgentes em aberto', array_agg(id) from a where priority = 'URGENTE'
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
      when 'URGENTE' then total || ' solicitação(ões) URGENTE(S) aguardando execução.'
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

