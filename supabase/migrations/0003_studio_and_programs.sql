-- Studio projects and guided programs.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  status text not null default 'active' check (status in ('active','paused','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_updated_idx on public.projects(user_id, updated_at desc);
alter table public.projects enable row level security;
create policy "project owner access" on public.projects
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

create table public.guided_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  objective text not null default '',
  status text not null default 'active' check (status in ('active','paused','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guided_programs_user_updated_idx on public.guided_programs(user_id, updated_at desc);
alter table public.guided_programs enable row level security;
create policy "guided program owner access" on public.guided_programs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger guided_programs_set_updated_at before update on public.guided_programs
for each row execute function public.set_updated_at();

create table public.program_steps (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.guided_programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  instructions text not null default '',
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index program_steps_program_position_idx on public.program_steps(program_id, position);
alter table public.program_steps enable row level security;
create policy "program step owner access" on public.program_steps
for all
using (
  auth.uid() = user_id
  and exists (select 1 from public.guided_programs p where p.id = program_id and p.user_id = auth.uid())
)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.guided_programs p where p.id = program_id and p.user_id = auth.uid())
);
