create extension if not exists "pgcrypto";

create table if not exists public.admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_emails enable row level security;

create or replace function public.is_board_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_emails
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.is_board_admin() to authenticated;

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  title text not null,
  note text not null,
  flower text not null default 'Tulip',
  vibe text not null default 'soft',
  image_path text not null,
  display_order integer not null default 0,
  is_featured boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.memories enable row level security;

drop policy if exists "Published memories are public" on public.memories;
create policy "Published memories are public"
on public.memories for select
using (is_published = true);

drop policy if exists "Authenticated users can create memories" on public.memories;
create policy "Admins can create memories"
on public.memories for insert
to authenticated
with check (auth.uid() = owner_id and public.is_board_admin());

drop policy if exists "Owners can update memories" on public.memories;
create policy "Admins can update their memories"
on public.memories for update
to authenticated
using (auth.uid() = owner_id and public.is_board_admin())
with check (auth.uid() = owner_id and public.is_board_admin());

drop policy if exists "Owners can delete memories" on public.memories;
create policy "Admins can delete their memories"
on public.memories for delete
to authenticated
using (auth.uid() = owner_id and public.is_board_admin());

insert into storage.buckets (id, name, public)
values ('her-photos', 'her-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public photo reads" on storage.objects;
create policy "Public photo reads"
on storage.objects for select
using (bucket_id = 'her-photos');

drop policy if exists "Authenticated photo uploads" on storage.objects;
create policy "Admins can upload photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'her-photos' and public.is_board_admin());

drop policy if exists "Owners can update photos" on storage.objects;
create policy "Admins can update their photos"
on storage.objects for update
to authenticated
using (bucket_id = 'her-photos' and owner = auth.uid() and public.is_board_admin())
with check (bucket_id = 'her-photos' and owner = auth.uid() and public.is_board_admin());

drop policy if exists "Owners can delete photos" on storage.objects;
create policy "Admins can delete their photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'her-photos' and owner = auth.uid() and public.is_board_admin());
