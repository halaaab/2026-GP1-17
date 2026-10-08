-- ---------------------------------------------------------
-- 0007 — Logos for incubators and accelerators
-- Run this once in the Supabase SQL Editor, after 0006.
--
-- Admins upload a program's logo on the Incubators & Accelerators
-- management page; founders see it on the explorer and details pages.
--   * support_organisations gets a logo_url column (the image's public address)
--   * the images live in a public Storage bucket, "program-logos":
--     everyone may see them, only admins may add, change or remove them
-- Nothing else changes: the table's other columns and rules stay as in 0006.
-- ---------------------------------------------------------


-- 1. The column. The table-level grants from 0006 already cover it.
alter table public.support_organisations
  add column if not exists logo_url text;


-- 2. The bucket: public (anyone can open a logo by its address),
--    at most 2 MB a file, pictures only. The page shrinks logos before uploading.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('program-logos', 'program-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;


-- 3. Who may change the files: admins only (is_admin() also needs the emailed code, 0003).
--    Showing a logo needs no rule: files in a public bucket are open by their address.
--    Removing a file needs the "select" rule too, so admins get one (nobody else can list the files).
drop policy if exists "admins list program logos" on storage.objects;
create policy "admins list program logos"
  on storage.objects for select to authenticated
  using (bucket_id = 'program-logos' and public.is_admin());

drop policy if exists "admins upload program logos" on storage.objects;
create policy "admins upload program logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'program-logos' and public.is_admin());

drop policy if exists "admins change program logos" on storage.objects;
create policy "admins change program logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'program-logos' and public.is_admin())
  with check (bucket_id = 'program-logos' and public.is_admin());

drop policy if exists "admins delete program logos" on storage.objects;
create policy "admins delete program logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'program-logos' and public.is_admin());
