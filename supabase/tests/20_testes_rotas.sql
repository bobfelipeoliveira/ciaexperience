-- Testes das rotas de urina (DADOS FICTÍCIOS). Rodar após 00_stub + migrations 001..005 + 10_testes.
\set QUIET on
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin execute sql; raise notice 'FALHOU (deveria bloquear): %', label;
exception when others then raise notice 'OK bloqueado: % -> %', label, left(sqlerrm, 90); end $$;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
create temp table ids as select id, patient_name from urine_collection_requests where scheduled_date = public.today_sp()+1 and archived_at is null and status not in ('REALIZADA','CANCELADA','NAO_REALIZADA') order by patient_name;
select 'coletas de amanhã para rotear: '||count(*) from ids;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect_fail(format($$select public.urine_route_save('{"route_date":"%s","name":"Rota teste","stops":[{"request_id":"%s"}]}')$$, public.today_sp()+1, (select id from ids limit 1)), 'técnica monta rota');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select public.urine_route_save(jsonb_build_object('route_date', public.today_sp()+1, 'name', 'Rota 1 · Zona Norte', 'region', 'Zona Norte', 'start_time', '07:30',
  'stops', (select jsonb_agg(jsonb_build_object('request_id', id, 'eta', '08:00')) from (select id from ids limit 2) x))) as r1 \gset
select 'rota 1 com '||count(*)||' paradas' from urine_collection_route_stops where route_id = :'r1';
select public.urine_route_save(jsonb_build_object('route_date', public.today_sp()+1, 'name', 'Rota 2', 'stops',
  (select jsonb_agg(jsonb_build_object('request_id', id)) from (select id from ids limit 1) x))) as r2 \gset
select 'parada movida: rota1='||(select count(*) from urine_collection_route_stops where route_id = :'r1')||' rota2='||(select count(*) from urine_collection_route_stops where route_id = :'r2');
select pg_temp.expect_fail(format($$select public.urine_route_set_status('%s','VALIDADA')$$, :'r1'), 'validar sem profissional');
select pg_temp.expect_fail(format($$select public.urine_route_save('{"route_date":"%s","name":"Rota teste","stops":[{"request_id":"%s"}]}')$$, public.today_sp()+5, (select id from ids limit 1)), 'coleta de outra data');
select public.urine_route_save(jsonb_build_object('id', :'r1', 'route_date', public.today_sp()+1, 'name', 'Rota 1', 'nurse_name', 'ENF. DEMO LÍDER',
  'stops', (select jsonb_agg(jsonb_build_object('request_id', id)) from (select id from ids offset 1 limit 2) x)));
select public.urine_route_set_status(:'r1', 'VALIDADA');
select 'validada: '||status||' por '||coalesce(validated_by_name,'?') from urine_collection_routes where id = :'r1';
select 'profissional gravado nas coletas: '||count(*) from urine_collection_requests r join urine_collection_route_stops s on s.request_id = r.id where s.route_id = :'r1' and r.assigned_nurse_name = 'ENF. DEMO LÍDER';
select pg_temp.expect_fail(format($$select public.urine_route_save('{"id":"%s","route_date":"%s","name":"Rota X","stops":[{"request_id":"%s"}]}')$$, :'r1', public.today_sp()+1, (select id from ids offset 1 limit 1)), 'alterar rota validada');
select pg_temp.expect_fail(format($$select public.urine_route_save('{"route_date":"%s","name":"Rota Y","stops":[{"request_id":"%s"}]}')$$, public.today_sp()+1, (select id from ids offset 1 limit 1)), 'tirar coleta de rota validada');
select public.urine_route_set_status(:'r1', 'RASCUNHO');
select public.urine_route_set_status(:'r1', 'CANCELADA');
select 'cancelada libera as coletas: '||count(*) from urine_collection_route_stops where route_id = :'r1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select 'técnica vê rotas: '||count(*) from urine_collection_routes;
delete from urine_collection_routes;  -- RLS: técnica não apaga (0 linhas)
select 'técnica tentou apagar — rotas restantes (esperado 2): '||count(*) from urine_collection_routes;
