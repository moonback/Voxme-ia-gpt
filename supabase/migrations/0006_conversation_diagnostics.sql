-- Private technical diagnostics. Message bodies, prompts, credentials and audio are never stored here.
create table public.conversation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  correlation_id text,
  turn_id text,
  level text not null check (level in ('debug','info','warn','error')),
  source text not null check (source in ('conversation','gemini-live','supabase','browser','backend')),
  event text not null,
  message text not null default '',
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index conversation_logs_user_created_idx on public.conversation_logs(user_id, created_at desc);
create index conversation_logs_session_created_idx on public.conversation_logs(session_id, created_at desc);
create index conversation_logs_correlation_idx on public.conversation_logs(correlation_id);
alter table public.conversation_logs enable row level security;
create policy "users read own conversation diagnostics" on public.conversation_logs
for select using (auth.uid() = user_id);
create policy "users write own conversation diagnostics" on public.conversation_logs
for insert with check (
  auth.uid() = user_id
  and (session_id is null or exists (
    select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()
  ))
);
