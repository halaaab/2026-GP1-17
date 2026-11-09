-- =========================================================
-- 0023 — Fix usernames cut to 3 letters
-- NOT APPLIED: it was not run before 0029 renamed users to founders.
-- Its sign-up fix is in 0029, and its username repair is 0030. Do not run this file.
--
-- The bug (since 0004_unique_usernames): sign-up cleaned the username with
--   rpad(name, 3, '_')
-- to make short names at least 3 letters long. But rpad also CUTS longer
-- names to exactly 3 letters, so "Larin" was saved as "Lar".
-- This file:
--   1. fixes sign-up, so only names shorter than 3 letters are padded
--   2. gives the founders who were cut back the username they typed
-- =========================================================


-- ---------------------------------------------------------
-- 1. Sign-up (same as 0022, with the padding fixed)
-- ---------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text;
  chosen text := new.raw_user_meta_data ->> 'user_type';
begin
  if new.raw_user_meta_data ? 'user_type' then
    wanted := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));
    wanted := left(regexp_replace(wanted, '[^A-Za-z0-9_]', '_', 'g'), 20);

    -- only a name shorter than 3 letters gets "_" added at the end
    if length(wanted) < 3 then
      wanted := rpad(wanted, 3, '_');
    end if;

    if not public.username_is_free(wanted) then
      wanted := left(wanted, 15) || '_' || left(new.id::text, 4);
    end if;

    insert into public.users (user_id, username, full_name, locale)
    values (
      new.id,
      wanted,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
      case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'ar' end
    );

    case chosen
      when 'student'        then insert into public.students        (user_id) values (new.id);
      when 'entrepreneur'   then insert into public.entrepreneurs   (user_id) values (new.id);
      when 'business_owner' then insert into public.business_owners (user_id) values (new.id);
      when 'investor'       then insert into public.investors       (user_id) values (new.id);
      else null;   -- 'none': just a founder
    end case;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------
-- 2. Give back the usernames that were cut.
--    A founder was cut when their username today is the first 3 letters
--    of the (cleaned) username they typed at sign-up, and that was longer.
--    If somebody else already uses the full name, a short ending is added,
--    the same way sign-up does it.
-- ---------------------------------------------------------

do $$
declare
  founder record;
  wanted  text;
begin
  for founder in
    select u.user_id, u.username,
           left(regexp_replace(a.raw_user_meta_data ->> 'username', '[^A-Za-z0-9_]', '_', 'g'), 20) as typed
    from public.users u
    join auth.users a on a.id = u.user_id
  loop
    if length(founder.typed) > 3 and founder.username = left(founder.typed, 3) then
      wanted := founder.typed;
      if not public.username_is_free(wanted) then
        wanted := left(wanted, 15) || '_' || left(founder.user_id::text, 4);
      end if;
      update public.users set username = wanted where user_id = founder.user_id;
    end if;
  end loop;
end;
$$;
