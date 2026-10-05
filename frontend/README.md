# Frontend

Darb's web application, built with plain **HTML, CSS and JavaScript** (no framework, no build step), with **Supabase** for accounts and data. Every page works in Arabic and English.

## Run it

Open the `frontend` folder in VS Code, right-click `index.html` and choose **Open with Live Server**. Pages must be opened this way; double-clicking a file will not work.

## Where things are

| Folder / file | What it holds |
|---|---|
| `index.html`, `index.css`, `index.js` | The landing page |
| `pages/` | One folder per page, each with its own `.html`, `.css` and `.js` |
| `pages/_template/` | The starting point for a new page. Copy this folder. |
| `shared/` | Everything pages share. Do not copy these into a page. |
| `translations/en.json`, `ar.json` | Every word shown on screen, in both languages |
| `assets/images/` | Logo and photos |

### The shared files

| File | What it does |
|---|---|
| `shared/variables.css` | Colours, fonts, corner sizes and shadows. Pages use `var(--name)`, never raw colours. |
| `shared/shared.css` | The look of every reusable piece: buttons, inputs, cards, tables, the sidebar, header and footer |
| `shared/layout.js` | **Builds the sidebar, header and footer.** They are written once here and appear on every page. |
| `shared/language.js` | Switches between Arabic and English |
| `shared/guard.js` | Keeps founder pages for founders and admin pages for admins; makes logout work |
| `shared/auth.js` | Sign up, sign in, log out, reset password |
| `shared/supabase.js` | The one connection to the database |
| `shared/ui.js` | Pop-up messages, dialogs, side panels, searchable dropdowns |
| `shared/components.html` | **Open this page to see every component and copy its HTML.** |

## Make a new page

1. Copy `pages/_template/` into the right place under `pages/` and rename the folder and its three files.
2. In the `.html` file, fix the two `<link>` lines and the last `<script>` line to the new file names. Add one `../` to the `shared` paths for each extra folder level.
3. On `<body>` set:
   - `data-layout`: `founder`, `admin`, `public` or `auth`
   - `data-page`: this page's id in the menu lists at the top of `shared/layout.js` (it highlights the page in the sidebar)
   - `data-title`: the translation key for the title in the header
4. Write the page's content inside `<main>`, using the classes shown in `shared/components.html`.
5. Put every piece of visible text in **both** translation files and show it with `data-i18n="your.key"`.

To add a link to a sidebar, add one line to `FOUNDER_MENU` or `ADMIN_MENU` at the top of `shared/layout.js`.

## Rules

- Do not copy the sidebar, header or footer into a page. `layout.js` adds them.
- Do not write colours, fonts or text directly in a page. Use the tokens and the translation files.
- Use `margin-inline-start`, `padding-inline-end` and so on, not `left` / `right`, so pages work in Arabic.
- Ask before changing anything in `shared/`: every page depends on it.

## Admin console

- Admin login: `pages/admin/admin-login/admin-login.html`. It is not linked from the landing page on purpose.
- Admins have no sign-up page. To add one, create the user in Supabase (Authentication → Users → Add user, with Auto Confirm), then run in the SQL Editor:
  `select public.make_admin('email', 'Full Name', 'username');`
- Admins sign in with two steps: the password, then a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator...). The first sign-in shows a QR code to connect the app.
- If an admin loses their phone, the query at the end of `backend/supabase/migrations/0003_admin_two_step.sql` lets them connect a new one.
