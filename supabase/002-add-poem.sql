-- Adds an optional short poem to each memory.
-- Safe to run more than once. Run it in the Supabase SQL Editor after
-- schema.sql, then reload the site.

alter table public.memories
  add column if not exists poem text;

comment on column public.memories.poem is
  'Optional few-line verse shown under the note in the memory dialog.';
