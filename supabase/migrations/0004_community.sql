-- Public community feed with owner-controlled posts and comments.

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  body text not null check (char_length(body) between 1 and 12000),
  visibility text not null default 'public' check (visibility in ('public','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_posts_public_created_idx on public.community_posts(visibility, created_at desc);
alter table public.community_posts enable row level security;
create policy "community posts visible to members" on public.community_posts
for select using (auth.uid() is not null and (visibility = 'public' or user_id = auth.uid()));
create policy "members create own community posts" on public.community_posts
for insert with check (auth.uid() = user_id);
create policy "owners update own community posts" on public.community_posts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owners delete own community posts" on public.community_posts
for delete using (auth.uid() = user_id);
create trigger community_posts_set_updated_at before update on public.community_posts
for each row execute function public.set_updated_at();

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index community_comments_post_created_idx on public.community_comments(post_id, created_at);
alter table public.community_comments enable row level security;
create policy "comments visible with post" on public.community_comments
for select using (
  auth.uid() is not null
  and exists (select 1 from public.community_posts p where p.id = post_id and (p.visibility = 'public' or p.user_id = auth.uid()))
);
create policy "members comment on public posts" on public.community_comments
for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.community_posts p where p.id = post_id and p.visibility = 'public')
);
create policy "owners delete own comments" on public.community_comments
for delete using (auth.uid() = user_id);

create table public.community_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'insightful' check (kind in ('insightful','support')),
  created_at timestamptz not null default now(),
  unique(post_id, user_id, kind)
);
create index community_reactions_post_idx on public.community_reactions(post_id);
alter table public.community_reactions enable row level security;
create policy "reactions visible with public post" on public.community_reactions
for select using (auth.uid() is not null and exists (select 1 from public.community_posts p where p.id = post_id and p.visibility = 'public'));
create policy "members react to public posts" on public.community_reactions
for insert with check (auth.uid() = user_id and exists (select 1 from public.community_posts p where p.id = post_id and p.visibility = 'public'));
create policy "owners remove own reactions" on public.community_reactions
for delete using (auth.uid() = user_id);
