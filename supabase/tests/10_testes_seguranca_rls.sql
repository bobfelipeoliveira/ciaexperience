-- Testes de segurança (RLS e regras de negócio) com DADOS FICTÍCIOS. Rodar em banco local após 00_stub + migrations. NÃO executar no Supabase de produção.
\set QUIET on
\pset pager off
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  execute sql; raise notice 'FALHOU (deveria bloquear): %', label;
exception when others then raise notice 'OK bloqueado: % -> %', label, left(sqlerrm, 90);
end $$;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;

-- Usuários (tenta forjar papel admin via metadata)
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','chefe@x.com','{"full_name":"Chefe Admin","role":"admin","status":"approved"}'),
 ('00000000-0000-0000-0000-0000000000c1','coord@x.com','{"full_name":"Coord Um"}'),
 ('00000000-0000-0000-0000-0000000000e1','tec1@x.com','{"full_name":"Tecnica Um"}') on conflict do nothing;
insert into auth.users (id,email,raw_user_meta_data,email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000e2','tec2@x.com','{"full_name":"Tecnica Dois"}', now());
select 'perfil forjado: status='||status||' roles='||(select count(*) from user_roles where user_id=p.id) from profiles p where email='chefe@x.com';
update auth.users set email_confirmed_at=now();
select public.bootstrap_first_admin('chefe@x.com');

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect_fail($$select public.bootstrap_first_admin('tec1@x.com')$$, 'tecnica chama bootstrap');
select pg_temp.expect_fail($$update profiles set status='approved' where id=auth.uid()$$, 'tecnica se auto-aprova');
select pg_temp.expect_fail($$insert into user_roles(user_id,role) values (auth.uid(),'admin')$$, 'tecnica insere papel admin');
select pg_temp.expect_fail($$select public.admin_set_user_role(auth.uid(),'admin',null,true)$$, 'tecnica usa RPC admin');
select 'pendente ve requests: '||count(*) from urine_collection_requests;
select pg_temp.expect_fail($$insert into urine_collection_requests(patient_name) values ('Teste')$$, 'pendente cria coleta');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select 'notificacoes admin: '||count(*) from notifications;
select public.admin_set_user_status('00000000-0000-0000-0000-0000000000e1','approved');
select public.admin_set_user_status('00000000-0000-0000-0000-0000000000e2','approved');
select public.admin_set_user_status('00000000-0000-0000-0000-0000000000c1','approved');
select public.admin_set_user_role('00000000-0000-0000-0000-0000000000e1','tecnica','urine_collection',true);
select public.admin_set_user_role('00000000-0000-0000-0000-0000000000e2','tecnica','urine_collection',true);
select public.admin_set_user_role('00000000-0000-0000-0000-0000000000c1','coordenacao','urine_collection',true);
select pg_temp.expect_fail($$select public.admin_set_user_status(auth.uid(),'blocked')$$, 'admin bloqueia a si mesmo');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect_fail($$insert into urine_collection_requests(patient_name,priority) values ('Maria da Silva','EMERGENCIAL')$$, 'prioridade EMERGENCIAL (não existe mais)');
select pg_temp.expect_fail($$insert into urine_collection_requests(patient_name,status) values ('Maria da Silva','REALIZADA')$$, 'realizada sem data de coleta');
insert into urine_collection_requests(patient_name,priority,emergency_justification,scheduled_date,contact_phone,created_by,material_available)
 values ('Maria  da Sílva','URGENTE',null, public.today_sp()+1,'(21) 99999-9999','00000000-0000-0000-0000-0000000000a1','NAO');
select 'created_by carimbado corretamente: '||(created_by='00000000-0000-0000-0000-0000000000e1')||' norm='||patient_name_norm||' fone='||phone_digits from urine_collection_requests;
insert into urine_collection_requests(patient_name,scheduled_date,neighborhood,city,family_contact_name,assigned_nurse_name,material_available) select 'Paciente '||g, public.today_sp()+1,'Penha','Rio de Janeiro','Ana','Enf X','SIM' from generate_series(1,3) g;
select pg_temp.expect_fail($$update urine_collection_requests set archived_at=now() where patient_name='Paciente 1'$$, 'tecnica arquiva');
select pg_temp.expect_fail($$update urine_collection_requests set scheduled_date=scheduled_date+3 where patient_name='Paciente 1'$$, 'altera data sem reagendar');
select public.urine_reschedule((select id from urine_collection_requests where patient_name='Paciente 1'), public.today_sp()+5, 'Pedido da filha', 'MANHA');
select 'reagendada: '||status||' original='||original_scheduled_date||' nova='||scheduled_date||' hist='||(select count(*) from urine_collection_reschedules) from urine_collection_requests where patient_name='Paciente 1';
select pg_temp.expect_fail($$select public.urine_import_rows(gen_random_uuid(),'[]')$$, 'tecnica importa');
select pg_temp.expect_fail($$insert into storage.objects(bucket_id,name) values ('urine-attachments','not-a-uuid/x.pdf')$$, 'upload fora de pasta de solicitacao');
insert into storage.objects(bucket_id,name) select 'urine-attachments', id||'/a.pdf' from urine_collection_requests where patient_name='Paciente 2';
select 'upload ok: '||count(*) from storage.objects;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
update urine_collection_requests set notes='hack' where patient_name='Paciente 2';
select 'tec2 editou registro alheio (deve ser 0): '||count(*) from urine_collection_requests where notes='hack';
select 'tec2 ve registros: '||count(*) from urine_collection_requests;
delete from storage.objects;  -- RLS: deve afetar 0 linhas
select 'tec2 tentou apagar anexo alheio — objetos restantes (esperado 1): '||count(*) from storage.objects;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select 'coord notificacoes: '||string_agg(kind,',') from notifications;
select 'ALERTAS: '||string_agg(kind||'('||total||')', ', ') from public.urine_alerts();
insert into urine_collection_requests(patient_name,scheduled_date) values ('Mais Um', public.today_sp()+1);
select 'ALERTA VOLUME: '||coalesce((select message from public.urine_alerts() where kind='VOLUME_AMANHA'),'nenhum');
update urine_collection_requests set archived_at=now(), archive_reason='teste' where patient_name='Mais Um';
select 'apos arquivar, volume: '||coalesce((select message from public.urine_alerts() where kind='VOLUME_AMANHA'),'nenhum');
select pg_temp.expect_fail($$update urine_collection_requests set status='CANCELADA' where patient_name='Paciente 3'$$, 'cancelar sem motivo');
delete from urine_collection_requests;  -- RLS: coordenação não exclui (0 linhas)
select 'coordenação tentou excluir — registros restantes (esperado 5): '||count(*) from urine_collection_requests;
select 'dup: '||count(*) from public.urine_find_duplicates('MARIA DA SILVA');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into urine_collection_import_batches(id,file_name,sheet_name) values ('11111111-1111-1111-1111-111111111111','q.xlsx','Coleta de urina');
select public.urine_import_rows('11111111-1111-1111-1111-111111111111','[{"import_key":"k1","patient_name":"Imp A","received_date":"2026-09-01","scheduled_date":"2026-09-03","original_scheduled_date":"2026-09-02","status":"REALIZADA","collected_date":"2026-09-03","legacy_data":{"linha":2}},{"import_key":"k2","patient_name":"Imp B","status":"REALIZADA","legacy_data":{"linha":3}}]');
select public.urine_import_rows('11111111-1111-1111-1111-111111111111','[{"import_key":"k1","patient_name":"Imp A"}]');
select 'auditoria linhas: '||count(*) from audit_logs;
select 'historico p/ admin campos alterados no reagendamento: '||new_data::text from audit_logs where table_name='urine_collection_requests' and action='UPDATE' limit 1;
reset role;
set role anon;
select pg_temp.as_user(null);
select 'anon ve setores: '||count(*) from sectors;
select pg_temp.expect_fail($$select * from urine_collection_requests$$, 'anon le coletas');
select pg_temp.expect_fail($$select public.my_access()$$, 'anon my_access');
