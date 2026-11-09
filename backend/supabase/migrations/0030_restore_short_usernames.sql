-- =========================================================
-- 0030 — Give back the usernames that were cut to 3 letters
-- Run once in Supabase: SQL Editor → paste → Run, after 0029.
--
-- Part 2 of 0023, written with the new table name (founders), because 0023
-- was not run before 0029. The sign-up fix itself is already in 0029.
--
-- A founder was cut when their username today is the first 3 letters of the
-- (cleaned) username they typed at sign-up, and that was longer.
-- If somebody else already uses the full name, a short ending is added,
-- the same way sign-up does it.
-- =========================================================

do $$
declare
  founder record;
  wanted  text;
begin
  for founder in
    select f.user_id, f.username,
           left(regexp_replace(a.raw_user_meta_data ->> 'username', '[^A-Za-z0-9_]', '_', 'g'), 20) as typed
    from public.founders f
    join auth.users a on a.id = f.user_id
  loop
    if length(founder.typed) > 3 and founder.username = left(founder.typed, 3) then
      wanted := founder.typed;
      if not public.username_is_free(wanted) then
        wanted := left(wanted, 15) || '_' || left(founder.user_id::text, 4);
      end if;
      update public.founders set username = wanted where user_id = founder.user_id;
    end if;
  end loop;
end;
$$;
