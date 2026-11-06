-- VOXME hardening: ownership consistency, profile provisioning and private document storage.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sessions_set_updated_at before update on public.sessions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop policy if exists "artifact owner access" on public.artifacts;
create policy "artifact owner access" on public.artifacts
for all
using (
  auth.uid() = user_id
  and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid())
)
with check (
  auth.uid() = user_id
  and (validated_by is null or validated_by = auth.uid())
  and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid())
);

drop policy if exists "memory owner access" on public.memories;
create policy "memory owner access" on public.memories
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (source_session_id is null or exists (
    select 1 from public.sessions s where s.id = source_session_id and s.user_id = auth.uid()
  ))
);

drop policy if exists "document owner access" on public.documents;
create policy "document owner access" on public.documents
for all
using (
  auth.uid() = user_id
  and exists (select 1 from public.notebooks n where n.id = notebook_id and n.user_id = auth.uid())
)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.notebooks n where n.id = notebook_id and n.user_id = auth.uid())
);

drop policy if exists "chunk owner access" on public.document_chunks;
create policy "chunk owner access" on public.document_chunks
for all
using (
  auth.uid() = user_id
  and exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())
)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voxme-documents', 'voxme-documents', false, 26214400,
  array['application/pdf','text/plain','text/markdown','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy "private document files read own folder"
on storage.objects for select
using (bucket_id = 'voxme-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "private document files upload own folder"
on storage.objects for insert
with check (bucket_id = 'voxme-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "private document files delete own folder"
on storage.objects for delete
using (bucket_id = 'voxme-documents' and (storage.foldername(name))[1] = auth.uid()::text);
