-- =====================================================================
-- CIA EXPERIENCE — 001 · NÚCLEO DA PLATAFORMA
-- Usuários, setores, módulos, perfis de acesso, configurações,
-- notificações e auditoria. Compartilhado por TODOS os módulos.
--
-- Como executar: Supabase → SQL Editor → New query → colar → Run.
-- Pode ser executado de novo com segurança (idempotente).
-- Toda a autorização fica AQUI (Row Level Security). O navegador usa
-- apenas a chave pública; o banco decide o que cada pessoa pode fazer.
-- =====================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------
create or replace function public.normalize_text(p text)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select nullif(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))), '\s+', ' ', 'g'), '')
$$;
-- (trim aplicado ao resultado)
create or replace function public.norm(p text)
returns text language sql immutable parallel safe
set search_path = ''
as $$ select nullif(btrim(public.normalize_text(p)), '') $$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.today_sp()
returns date language sql stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. Setores
-- ---------------------------------------------------------------------
create table if not exists public.sectors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists sectors_name_uq on public.sectors (lower(name));

insert into public.sectors (name) values
  ('Intercorrência'), ('Coordenação de Enfermagem'), ('Administrativo')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Módulos da plataforma (novos módulos entram como novas linhas)
-- ---------------------------------------------------------------------
create table if not exists public.modules (
  key          text primary key check (key ~ '^[a-z][a-z0-9_]{2,40}$'),
  name         text not null,
  description  text,
  active       boolean not null default false,
  sort_order   int not null default 100
);

insert into public.modules (key, name, description, active, sort_order) values
  ('urine_collection',      'Coletas de Urina',             'Solicitação, agenda, execução e logística de coletas de urina.', true, 10),
  ('hospital_removals',     'Remoções Hospitalares',         'Módulo futuro.', false, 20),
  ('external_nurse_routes', 'Rotas de Enfermeiros Externos', 'Módulo futuro.', false, 30),
  ('materials',             'Materiais e Recargas',          'Módulo futuro.', false, 40),
  ('external_demands',      'Demandas Externas',             'Módulo futuro.', false, 50),
  ('shift_handover',        'Passagens de Plantão',          'Módulo futuro.', false, 60)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Perfis (1 por usuário do Supabase Auth)
--    O STATUS só muda por funções administrativas (abaixo).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text not null check (char_length(btrim(full_name)) between 3 and 150),
  email               text,
  phone               text check (phone is null or char_length(phone) <= 30),
  sector_id           uuid references public.sectors(id) on delete set null,
  status              text not null default 'pending'
                        check (status in ('pending','approved','rejected','blocked')),
  status_reason       text check (status_reason is null or char_length(status_reason) <= 500),
  email_confirmed_at  timestamptz,
  approved_by         uuid references auth.users(id) on delete set null,
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists profiles_status_idx on public.profiles (status);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. Papéis (RBAC por módulo)
--    admin        → global (module_key nulo)
--    coordenacao  → por módulo
--    tecnica      → por módulo
-- ---------------------------------------------------------------------
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('admin','coordenacao','tecnica')),
  module_key  text references public.modules(key) on delete cascade,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  constraint user_roles_scope check (
    (role = 'admin' and module_key is null) or (role <> 'admin' and module_key is not null)
  )
);
create unique index if not exists user_roles_uq
  on public.user_roles (user_id, role, coalesce(module_key, '*'));

-- ---------------------------------------------------------------------
-- 5. Configurações do sistema (chave → valor)
-- ---------------------------------------------------------------------
create table if not exists public.system_settings (
  key          text primary key check (key ~ '^[a-z][a-z0-9_.]{2,80}$'),
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

insert into public.system_settings (key, value, description) values
  ('admin_notification_email', 'null'::jsonb, 'E-mail que recebe aviso de novos cadastros (usado pela função opcional de e-mail).'),
  ('urine.volume_alert_threshold', '3'::jsonb, 'Alerta quando houver MAIS que este número de coletas agendadas para amanhã.'),
  ('urine.stale_hours', '48'::jsonb, 'Horas sem atualização para gerar alerta de solicitação parada.'),
  ('urine.tecnica_can_edit_all', 'false'::jsonb, 'Se verdadeiro, técnicas podem editar solicitações criadas por outras pessoas.'),
  ('urine.proximity_km', '6'::jsonb, 'Distância (km, em linha reta) para sugerir agrupamento de coletas próximas.'),
  ('urine.service_minutes', '30'::jsonb, 'Tempo estimado de atendimento por coleta (minutos), usado nas sugestões logísticas.'),
  ('urine.avg_speed_kmh', '22'::jsonb, 'Velocidade média urbana estimada (km/h) para estimativa de deslocamento.')
on conflict (key) do nothing;

drop trigger if exists settings_touch on public.system_settings;
create trigger settings_touch before update on public.system_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 6. Funções de autorização (usadas pelas políticas RLS)
--    SECURITY DEFINER para ler perfis/papéis sem recursão de RLS.
-- ---------------------------------------------------------------------
create or replace function public.is_approved()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select public.is_approved() and exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  )
$$;

create or replace function public.has_module_role(p_module text, p_roles text[])
returns boolean language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (
    public.is_approved() and exists (
      select 1 from public.user_roles r
      join public.modules m on m.key = r.module_key and m.active
      where r.user_id = auth.uid() and r.module_key = p_module and r.role = any(p_roles)
    )
  )
$$;

create or replace function public.can_access_module(p_module text)
returns boolean language sql stable
set search_path = ''
as $$ select public.has_module_role(p_module, array['coordenacao','tecnica']) $$;

create or replace function public.get_setting(p_key text)
returns jsonb language sql stable security definer
set search_path = ''
as $$ select value from public.system_settings where key = p_key $$;

-- ---------------------------------------------------------------------
-- 7. Notificações (central de notificações por usuário)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  module_key  text references public.modules(key) on delete cascade,
  kind        text not null,
  severity    text not null default 'info' check (severity in ('info','warning','critical')),
  title       text not null,
  body        text,
  link        text check (link is null or link ~ '^/[A-Za-z0-9/_\-?=&.]*$'),
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create unique index if not exists notifications_dedupe_uq on public.notifications (user_id, dedupe_key);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create or replace function public.notify_users(
  p_user_ids uuid[], p_module text, p_kind text, p_severity text,
  p_title text, p_body text, p_link text, p_dedupe text)
returns void language sql security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, module_key, kind, severity, title, body, link, dedupe_key)
  select u, p_module, p_kind, p_severity, p_title, p_body, p_link, p_dedupe
  from unnest(p_user_ids) as u
  on conflict (user_id, dedupe_key) do nothing
$$;

create or replace function public.admin_user_ids()
returns uuid[] language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.user_id), '{}')
  from public.user_roles r join public.profiles p on p.id = r.user_id
  where r.role = 'admin' and p.status = 'approved'
$$;

create or replace function public.module_staff_ids(p_module text, p_roles text[])
returns uuid[] language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.user_id), '{}')
  from public.user_roles r join public.profiles p on p.id = r.user_id
  where p.status = 'approved'
    and (r.role = 'admin' or (r.module_key = p_module and r.role = any(p_roles)))
$$;

-- ---------------------------------------------------------------------
-- 8. Cadastro: criação automática do perfil PENDENTE
--    Do formulário de cadastro aproveitamos APENAS nome, telefone e
--    setor. Nenhum privilégio vem do que o usuário digita.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_name   text := left(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), 150);
  v_phone  text := left(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), 30);
  v_sector uuid := public.try_uuid(new.raw_user_meta_data->>'sector_id');
begin
  if char_length(v_name) < 3 then
    v_name := split_part(coalesce(new.email, 'Usuário'), '@', 1);
    if char_length(v_name) < 3 then v_name := 'Usuário'; end if;
  end if;
  if v_sector is not null and not exists (select 1 from public.sectors s where s.id = v_sector and s.active) then
    v_sector := null;
  end if;

  insert into public.profiles (id, full_name, email, phone, sector_id, status, email_confirmed_at)
  values (new.id, v_name, lower(new.email), nullif(v_phone, ''), v_sector, 'pending', new.email_confirmed_at)
  on conflict (id) do nothing;

  if new.email_confirmed_at is not null then
    perform public.notify_users(public.admin_user_ids(), null, 'new_signup', 'info',
      'Novo cadastro aguardando aprovação', v_name || ' solicitou acesso à plataforma.',
      '/usuarios', 'signup:' || new.id::text);
  end if;
  return new;
end $$;

create or replace function public.handle_auth_user_confirmed()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_name text;
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set email_confirmed_at = new.email_confirmed_at
      where id = new.id returning full_name into v_name;
    perform public.notify_users(public.admin_user_ids(), null, 'new_signup', 'info',
      'Novo cadastro aguardando aprovação', coalesce(v_name, 'Um usuário') || ' confirmou o e-mail e aguarda aprovação.',
      '/usuarios', 'signup:' || new.id::text);
  end if;
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email_confirmed_at, email on auth.users
  for each row execute function public.handle_auth_user_confirmed();

-- Perfis de usuários que já existiam antes deste script
insert into public.profiles (id, full_name, email, status, email_confirmed_at)
select u.id,
       coalesce(nullif(left(btrim(u.raw_user_meta_data->>'full_name'), 150), ''), split_part(u.email, '@', 1)),
       lower(u.email), 'pending', u.email_confirmed_at
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
  and char_length(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))) >= 3
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 9. Auditoria (gravada SOMENTE por gatilhos; ninguém edita)
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  user_id      uuid,
  action       text not null,
  table_name   text,
  record_id    text,
  module_key   text,
  old_data     jsonb,
  new_data     jsonb
);
create index if not exists audit_logs_record_idx on public.audit_logs (table_name, record_id, occurred_at desc);
create index if not exists audit_logs_time_idx on public.audit_logs (occurred_at desc);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id, occurred_at desc);

-- Gatilho genérico: em UPDATE guarda apenas os campos alterados.
-- TG_ARGV[0] = módulo (opcional)
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_old jsonb; v_new jsonb; k text;
  v_ignore text[] := array['updated_at','patient_name_norm','phone_digits','updated_by'];
  v_id text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_id := v_new->>'id';
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_id := v_old->>'id';
  else
    v_old := '{}'::jsonb; v_new := '{}'::jsonb; v_id := to_jsonb(new)->>'id';
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k = any(v_ignore) then continue; end if;
      if (to_jsonb(old)->k) is distinct from (to_jsonb(new)->k) then
        v_old := v_old || jsonb_build_object(k, to_jsonb(old)->k);
        v_new := v_new || jsonb_build_object(k, to_jsonb(new)->k);
      end if;
    end loop;
    if v_new = '{}'::jsonb then return new; end if;
  end if;
  insert into public.audit_logs (user_id, action, table_name, record_id, module_key, old_data, new_data)
  values (auth.uid(), tg_op, tg_table_name, v_id, nullif(tg_argv[0], ''), v_old, v_new);
  return coalesce(new, old);
end $$;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change('');
drop trigger if exists audit_user_roles on public.user_roles;
create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change('');
drop trigger if exists audit_settings on public.system_settings;
create trigger audit_settings after insert or update or delete on public.system_settings
  for each row execute function public.audit_row_change('');
drop trigger if exists audit_sectors on public.sectors;
create trigger audit_sectors after insert or update or delete on public.sectors
  for each row execute function public.audit_row_change('');

-- Eventos de sessão (login/logout) registrados pelo próprio usuário
create or replace function public.log_session_event(p_action text)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_action not in ('LOGIN','LOGOUT') then
    raise exception 'Evento inválido';
  end if;
  insert into public.audit_logs (user_id, action, table_name, record_id)
  values (auth.uid(), p_action, 'auth', auth.uid()::text);
end $$;

-- ---------------------------------------------------------------------
-- 10. Funções para a aplicação
-- ---------------------------------------------------------------------

-- Dados de acesso do usuário logado (perfil + papéis)
create or replace function public.my_access()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'approved_by' from public.profiles p where p.id = auth.uid()),
    'sector',  (select s.name from public.profiles p join public.sectors s on s.id = p.sector_id where p.id = auth.uid()),
    'roles',   coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'module_key', r.module_key))
                         from public.user_roles r where r.user_id = auth.uid()), '[]'::jsonb),
    'modules', coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order) from public.modules m), '[]'::jsonb)
  )
$$;

-- Lista mínima de colaboradores aprovados (sem e-mail/telefone)
create or replace function public.list_staff(p_module text default null)
returns table (id uuid, full_name text, sector text, roles text[])
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.full_name, s.name,
         coalesce(array_agg(distinct r.role) filter (where r.role is not null), '{}')
  from public.profiles p
  left join public.sectors s on s.id = p.sector_id
  left join public.user_roles r on r.user_id = p.id and (p_module is null or r.module_key = p_module or r.role = 'admin')
  where public.is_approved() and p.status = 'approved'
  group by p.id, p.full_name, s.name
  order by p.full_name
$$;

-- ADMIN: aprovar, recusar, bloquear, reativar
create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  if p_status not in ('pending','approved','rejected','blocked') then raise exception 'Status inválido.'; end if;
  if p_user = auth.uid() and p_status <> 'approved' then
    raise exception 'Você não pode bloquear ou recusar o seu próprio acesso.';
  end if;
  if p_status = 'approved' and not exists (
      select 1 from public.profiles where id = p_user and email_confirmed_at is not null) then
    raise exception 'O usuário ainda não confirmou o e-mail.';
  end if;
  update public.profiles
     set status = p_status,
         status_reason = left(p_reason, 500),
         approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
         approved_at = case when p_status = 'approved' then now() else approved_at end
   where id = p_user;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if p_status = 'approved' then
    perform public.notify_users(array[p_user], null, 'access_approved', 'info',
      'Acesso aprovado', 'Seu acesso ao CIA EXPERIENCE foi liberado.', '/', 'approved:' || p_user::text || ':' || extract(epoch from now())::bigint);
  end if;
end $$;

-- ADMIN: conceder/remover papel
create or replace function public.admin_set_user_role(p_user uuid, p_role text, p_module text, p_grant boolean)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  if p_role not in ('admin','coordenacao','tecnica') then raise exception 'Papel inválido.'; end if;
  if p_role = 'admin' then p_module := null;
  elsif p_module is null or not exists (select 1 from public.modules where key = p_module) then
    raise exception 'Módulo inválido.';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role, module_key, granted_by)
    values (p_user, p_role, p_module, auth.uid())
    on conflict do nothing;
  else
    if p_user = auth.uid() and p_role = 'admin' then
      raise exception 'Você não pode remover o seu próprio perfil de administrador.';
    end if;
    delete from public.user_roles
     where user_id = p_user and role = p_role and coalesce(module_key, '*') = coalesce(p_module, '*');
  end if;
end $$;

-- ADMIN: listar usuários (com e-mail/telefone — somente admin)
create or replace function public.admin_list_users()
returns table (id uuid, full_name text, email text, phone text, sector text, status text,
               status_reason text, email_confirmed_at timestamptz, created_at timestamptz,
               approved_at timestamptz, roles jsonb)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  return query
  select p.id, p.full_name, p.email, p.phone, s.name, p.status, p.status_reason,
         p.email_confirmed_at, p.created_at, p.approved_at,
         coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'module_key', r.module_key))
                   from public.user_roles r where r.user_id = p.id), '[]'::jsonb)
  from public.profiles p left join public.sectors s on s.id = p.sector_id
  order by (p.status = 'pending') desc, p.created_at desc;
end $$;

-- PRIMEIRO ADMINISTRADOR — executar MANUALMENTE no SQL Editor do Supabase.
-- Não pode ser chamada pelo site (permissão revogada abaixo).
create or replace function public.bootstrap_first_admin(p_email text)
returns text language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    return 'Usuário não encontrado. Crie a conta pela tela de cadastro e confirme o e-mail antes.';
  end if;
  update public.profiles
     set status = 'approved', approved_at = now(),
         email_confirmed_at = coalesce(email_confirmed_at, (select email_confirmed_at from auth.users where id = v_id))
   where id = v_id;
  insert into public.user_roles (user_id, role, module_key) values (v_id, 'admin', null) on conflict do nothing;
  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (null, 'BOOTSTRAP_ADMIN', 'user_roles', v_id::text, jsonb_build_object('role', 'admin'));
  return 'OK: administrador configurado.';
end $$;

-- ---------------------------------------------------------------------
-- 11. Permissões de tabela + RLS
-- ---------------------------------------------------------------------
alter table public.sectors          enable row level security;
alter table public.modules          enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_roles       enable row level security;
alter table public.system_settings  enable row level security;
alter table public.notifications    enable row level security;
alter table public.audit_logs       enable row level security;

revoke all on public.sectors, public.modules, public.profiles, public.user_roles,
              public.system_settings, public.notifications, public.audit_logs from anon, authenticated;

-- setores: leitura pública só dos ativos (necessário na tela de cadastro)
grant select on public.sectors to anon, authenticated;
grant insert, update on public.sectors to authenticated;
drop policy if exists sectors_read on public.sectors;
create policy sectors_read on public.sectors for select to anon, authenticated
  using (active or public.is_admin());
drop policy if exists sectors_admin_ins on public.sectors;
create policy sectors_admin_ins on public.sectors for insert to authenticated with check (public.is_admin());
drop policy if exists sectors_admin_upd on public.sectors;
create policy sectors_admin_upd on public.sectors for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- módulos: leitura para usuários logados; alteração só admin
grant select, update on public.modules to authenticated;
drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules for select to authenticated using (true);
drop policy if exists modules_admin on public.modules;
create policy modules_admin on public.modules for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- perfis: cada um lê o próprio; admin lê todos.
-- Atualização: SOMENTE nome, telefone e setor (status/papéis só via funções admin).
grant select on public.profiles to authenticated;
grant update (full_name, phone, sector_id) on public.profiles to authenticated;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- papéis: cada um vê os próprios; admin vê todos. Escrita só via função admin.
grant select on public.user_roles to authenticated;
drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- configurações: leitura por aprovados; escrita só admin
grant select, update on public.system_settings to authenticated;
drop policy if exists settings_read on public.system_settings;
create policy settings_read on public.system_settings for select to authenticated using (public.is_approved());
drop policy if exists settings_admin on public.system_settings;
create policy settings_admin on public.system_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- notificações: cada um só as próprias; pode marcar como lida e apagar
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- auditoria: admin lê tudo; demais leem só o histórico das solicitações do módulo
grant select on public.audit_logs to authenticated;
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated
  using (
    public.is_admin()
    or (module_key is not null and public.can_access_module(module_key))
  );

-- Funções: ninguém de fora chama funções internas
revoke execute on function public.bootstrap_first_admin(text) from public, anon, authenticated;
revoke execute on function public.notify_users(uuid[], text, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_confirmed() from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.admin_user_ids() from public, anon, authenticated;
revoke execute on function public.module_staff_ids(text, text[]) from public, anon, authenticated;
revoke execute on function public.my_access() from public, anon;
revoke execute on function public.list_staff(text) from public, anon;
revoke execute on function public.admin_set_user_status(uuid, text, text) from public, anon;
revoke execute on function public.admin_set_user_role(uuid, text, text, boolean) from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.log_session_event(text) from public, anon;
grant execute on function public.my_access(), public.list_staff(text),
  public.admin_set_user_status(uuid, text, text), public.admin_set_user_role(uuid, text, text, boolean),
  public.admin_list_users(), public.log_session_event(text) to authenticated;
