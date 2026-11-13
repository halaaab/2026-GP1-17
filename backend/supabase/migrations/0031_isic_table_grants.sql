-- =========================================================
-- 0031 — Tight permissions on the two ISIC tables
-- Run once in Supabase: SQL Editor → paste → Run, after 0030.
--
-- 0029 created requirement_isic_sections and requirement_isic_divisions with
-- Supabase's default permissions, which include TRUNCATE (emptying a table) for
-- everyone. Row Level Security does not stop TRUNCATE, so they are removed.
-- Same rights as regulatory_requirements: everyone reads; signed-in users may
-- add and delete rows, and the policies of 0029 allow that to admins only.
-- =========================================================

revoke all on public.requirement_isic_sections, public.requirement_isic_divisions from anon, authenticated;

grant select on public.requirement_isic_sections, public.requirement_isic_divisions to anon, authenticated;
grant insert, delete on public.requirement_isic_sections, public.requirement_isic_divisions to authenticated;
