create extension if not exists pgcrypto;
create extension if not exists vector;

create type public.session_status as enum ('active', 'paused', 'completed', 'archived');
create type public.artifact_status as enum ('proposed', 'accepted', 'rejected', 'open');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nouvelle réflexion',
  status public.session_status not null default 'active',
  mode text not null default 'roundtable' check (mode in ('roundtable','free_debate','guided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_user_updated_idx on public.sessions(user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  speaker text not null check (speaker in ('user','chloe','thomas','ines','system')),
  content text not null,
  transcript text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_session_created_idx on public.messages(session_id, created_at);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('summary','decision','task','open_question','mindmap')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  status public.artifact_status not null default 'proposed',
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_at timestamptz not null default now()
);
create index artifacts_session_kind_idx on public.artifacts(session_id, kind);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  content text not null,
  source_session_id uuid references public.sessions(id) on delete set null,
  is_validated boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index memories_user_category_idx on public.memories(user_id, category);

create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  storage_path text,
  mime_type text,
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  created_at timestamptz not null default now()
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(768),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(document_id, chunk_index)
);
create index document_chunks_embedding_idx on public.document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  endpoint text not null,
  transport text not null default 'streamable_http' check (transport in ('streamable_http','stdio')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.artifacts enable row level security;
alter table public.memories enable row level security;
alter table public.notebooks enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.mcp_servers enable row level security;

create policy "profile owner access" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "session owner access" on public.sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "message owner access" on public.messages for all using (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid())) with check (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "artifact owner access" on public.artifacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "memory owner access" on public.memories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notebook owner access" on public.notebooks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "document owner access" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "chunk owner access" on public.document_chunks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "mcp owner access" on public.mcp_servers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.match_document_chunks(
  query_embedding vector(768),
  match_count int default 8,
  filter_notebook uuid default null
) returns table (id uuid, document_id uuid, content text, metadata jsonb, similarity float)
language sql stable
as $$
  select c.id, c.document_id, c.content, c.metadata,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.user_id = auth.uid()
    and (filter_notebook is null or d.notebook_id = filter_notebook)
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 30));
$$;
