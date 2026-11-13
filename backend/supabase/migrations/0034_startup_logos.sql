-- ---------------------------------------------------------
-- 0034 — Logos for startups
-- Run this once in the Supabase SQL Editor, after 0033. (Safe to run again.)
--
-- Startup logos used to point at other websites. Now Darb keeps its own
-- copy of each one in a public Storage bucket, "startup-logos", so a logo
-- keeps working even if the company changes its website.
--   * everyone may see the logos, only admins may add, change or remove them
--   * the startups table needs nothing new: its "logo" column (0006)
--     holds the logo's public address in this bucket
-- ---------------------------------------------------------


-- 1. The bucket: public (anyone can open a logo by its address),
--    at most 2 MB a file, pictures only. Many company logos are SVG files,
--    so SVG is allowed here as well.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('startup-logos', 'startup-logos', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;


-- 2. Who may change the files: admins only (is_admin() also needs the emailed code, 0003).
--    Showing a logo needs no rule: files in a public bucket are open by their address.
--    Removing a file needs the "select" rule too, so admins get one (nobody else can list the files).
drop policy if exists "admins list startup logos" on storage.objects;
create policy "admins list startup logos"
  on storage.objects for select to authenticated
  using (bucket_id = 'startup-logos' and public.is_admin());

drop policy if exists "admins upload startup logos" on storage.objects;
create policy "admins upload startup logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'startup-logos' and public.is_admin());

drop policy if exists "admins change startup logos" on storage.objects;
create policy "admins change startup logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'startup-logos' and public.is_admin())
  with check (bucket_id = 'startup-logos' and public.is_admin());

drop policy if exists "admins delete startup logos" on storage.objects;
create policy "admins delete startup logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'startup-logos' and public.is_admin());
