-- =====================================================================
-- CIA EXPERIENCE — 003 · ARMAZENAMENTO PRIVADO DE ANEXOS
-- Execute DEPOIS do 002. Idempotente.
--
-- Bucket PRIVADO: não existe link público. O site gera URLs temporárias
-- (60 segundos) somente para quem tem permissão de ler a solicitação.
-- Caminho dos arquivos: <id_da_solicitacao>/<uuid>-<nome-do-arquivo>
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('urine-attachments', 'urine-attachments', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "urine attachments read" on storage.objects;
create policy "urine attachments read" on storage.objects for select to authenticated
  using (
    bucket_id = 'urine-attachments'
    and public.urine_can_read_request(public.try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "urine attachments upload" on storage.objects;
create policy "urine attachments upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'urine-attachments'
    and public.can_access_module('urine_collection')
    and public.urine_can_read_request(public.try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "urine attachments delete" on storage.objects;
create policy "urine attachments delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'urine-attachments'
    and (
      public.has_module_role('urine_collection', array['coordenacao'])
      or (owner_id = auth.uid()::text
          and public.urine_can_edit_request(public.try_uuid((storage.foldername(name))[1])))
    )
  );
-- Não há política de UPDATE: arquivos enviados não podem ser substituídos.
