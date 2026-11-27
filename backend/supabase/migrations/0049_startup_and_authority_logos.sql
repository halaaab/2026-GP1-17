-- ---------------------------------------------------------
-- 0049 — Logos uploaded for startups and regulatory authorities (Member 1, 28 Nov 2026)
-- Run this once in the Supabase SQL Editor, after 0048. (Safe to run again.)
--
-- The admin add / edit panels now share one design on the Startups, Incubators & Accelerators and Regulatory
-- requirements pages, including the logo: upload a picture (or paste a link). Only incubators could upload
-- (0011, "program-logos"). This adds the same kind of Storage bucket for the other two:
--   * "startup-logos"    the picture's public address is saved in startups.logo (as before: a web address)
--   * "authority-logos"  saved in regulatory_requirements.authority_logo (as before)
-- Storage buckets are files, not tables: no table, column or relation changes (the ERD stays as it is).
-- Everyone may see the logos (founder pages show them); only admins may add, change or remove them.
-- ---------------------------------------------------------


-- 1. The buckets: public (a logo opens by its address), at most 2 MB a file, pictures only.
--    The page shrinks logos before uploading, as for programs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('startup-logos', 'startup-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('authority-logos', 'authority-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;


-- 2. Who may change the files: admins only (is_admin(), 0003). Removing a file needs the "select" rule too.
drop policy if exists "admins list startup and authority logos" on storage.objects;
create policy "admins list startup and authority logos"
  on storage.objects for select to authenticated
  using (bucket_id in ('startup-logos', 'authority-logos') and public.is_admin());

drop policy if exists "admins upload startup and authority logos" on storage.objects;
create policy "admins upload startup and authority logos"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('startup-logos', 'authority-logos') and public.is_admin());

drop policy if exists "admins change startup and authority logos" on storage.objects;
create policy "admins change startup and authority logos"
  on storage.objects for update to authenticated
  using (bucket_id in ('startup-logos', 'authority-logos') and public.is_admin())
  with check (bucket_id in ('startup-logos', 'authority-logos') and public.is_admin());

drop policy if exists "admins delete startup and authority logos" on storage.objects;
create policy "admins delete startup and authority logos"
  on storage.objects for delete to authenticated
  using (bucket_id in ('startup-logos', 'authority-logos') and public.is_admin());
