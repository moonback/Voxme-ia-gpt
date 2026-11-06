-- Server-managed roles. No client-side policy may grant or change a role.
create type public.app_role as enum ('admin','member');
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;
create policy "users can read own role" on public.user_roles
for select using (auth.uid() = user_id);
-- Inserts and role changes are intentionally service-role only.
