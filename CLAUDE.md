# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

MyBookShelf is a personal reading journal: an Express 5 + PostgreSQL API with a vanilla-JS frontend (no build step), deployed on Vercel.

## Commands

```bash
npm run dev               # nodemon server.js -> http://localhost:3000 (PORT overrides)
npm start                 # node server.js
npm run migrate           # apply pending migrations/*.sql (local DB, or Neon if DATABASE_URL is set)
node testGoogleBooks.js   # sanity-check GOOGLE_BOOKS_API_KEY
```

There is no linter or bundler. Check syntax with `node --check <file>`.

End-to-end tests: Playwright + TypeScript in `e2e/` (`npm run test:e2e`, `npm run typecheck:e2e`, `npm run test:e2e:report`). The config starts its own server on port 3210 against the **local** database and refuses to run if `DATABASE_URL` is set. Each test signs up a throwaway `@example.test` account and deletes it afterwards. To shake out races, run `npx playwright test --repeat-each=5 --workers=8`.

Running migrations against production (PowerShell). The owner runs these, not Claude. Before running, take a Neon snapshot branch (Neon console > Branches > Create branch from `main`). Delete the snapshot about a week later if nothing went wrong. If something breaks, fix it forward with a new migration; restore the snapshot only if real data was lost.
```powershell
$env:DATABASE_URL = "<neon connection string>"; npm run migrate; Remove-Item Env:DATABASE_URL
```

## Environment

`.env` (never committed; see `.env.example`): `DB_USER/DB_HOST/DB_NAME/DB_PASSWORD/DB_PORT` for local Postgres, or `DATABASE_URL` for Neon (it wins when set). Also `JWT_SECRET`, `GOOGLE_BOOKS_API_KEY`, `BLOB_READ_WRITE_TOKEN` (Vercel Blob, **public** store), and `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM` (Gmail app password; in dev without SMTP the reset email is logged as `[mail:dev]`). `APP_URL` optionally overrides the link base in emails.

## Deployment

- Vercel deploys **only `main`** (production). `vercel.json` disables deployments for `dev` (`git.deploymentEnabled.dev = false`). Work happens on `dev` and is merged into `main` to release.
- **Git rules:** never `git push`, and never merge `dev` into `main`. The owner does both. Commit only when asked.
- Migrations are **not** run automatically. Run new `migrations/*.sql` against Neon before merging to `main`, or the live site breaks on missing columns.
- `server.js` exports the app for Vercel and only calls `listen()` when `NODE_ENV !== "production"`.
- Security headers (HSTS, CSP `upgrade-insecure-requests`, nosniff) are set in **both** `vercel.json` (static pages) and Express middleware (API), because on Vercel static files don't pass through Express.
- Vercel limits request bodies to ~4.5 MB; uploads are capped at 4 MB.

## Backend architecture (`server.js`, `src/`)

- `routes/*` -> `controllers/*` -> `pool` from `config/db.js`. Responses are `{ status, message, data }`. Unknown `/api` routes get JSON 404; a central error handler turns Multer errors into 400s.
- `config/db.js` sets a pg type parser so `DATE` columns come back as `"YYYY-MM-DD"` strings (prevents off-by-one-day bugs).
- **Migrations**: `scripts/migrate.js` applies `migrations/NNN_*.sql` in filename order, each in a transaction, recorded in `schema_migrations`. Add a new numbered file; never edit an applied one.
- **IDs**: every table's `id` comes from a database sequence (`users`/`books` since migration 008; they used to be `Date.now()`, which collided). Never set `id` in an INSERT.
- **Auth/session**: login sets an HttpOnly JWT cookie (`utils/session.js`; `__Host-mbs_session` in production, `mbs_session` locally). The token carries `tv` (session version). `middleware/authMiddleware.js` checks it against `users.token_version`; a password reset increments that column, which signs the user out everywhere. `sameOriginOnly` rejects cross-site POST/PUT/PATCH/DELETE (CSRF). Emails are stored lower-case and compared case-insensitively.
- **401 has a side effect**: the frontend treats any 401 as "session over" and logs out. Use 400 for things like a wrong password on account deletion.
- **Books**: `bookController.parseBook` validates every field and maps camelCase input to snake_case columns (`COLUMNS`). `PUT /api/books/:id` is a **full replacement**, so the client must send every field. An increased `current_page` inserts a `reading_activities` row. `genre` and `completed_at` are legacy columns kept in sync.
- **Covers** (`services/coverStorage.js`): uploads go to Vercel Blob at `covers/<userId>/<uuid>.<ext>`. The image type is sniffed from the bytes. Old covers are deleted when replaced or when the book or account is deleted, but only files that `isOwnedCover()` confirms are in this store **and** this user's folder. Google Books cover URLs are stored as-is and never deleted. Cloudinary is gone: the account was closed and migration 006 cleared its old links. Don't add Cloudinary code back.
- Password reset (`passwordResetController.js`): SHA-256-hashed single-use tokens, 1-hour expiry, 60 s resend throttle, always a generic reply. Email links never use the request's Host header.
- The Google Books search endpoint requires login (it spends the API key quota).

## Frontend architecture (`public/`)

- Plain ES modules, no framework. Pages: `index.html` (the app) plus standalone `login`, `register`, `forgot-password`, `reset-password`, `privacy` and `terms` pages (`auth.js` drives the auth pages). If a framework is ever needed, the owner wants **React**.
- `js/app.js`: hash router (`#/dashboard`, `#/library`, `#/book/:id`, `#/authors`, `#/author/:name`, `#/series`, `#/series/:name`, `#/challenges`, `#/challenges/:id`, `#/statistics`). The `ROUTES` table maps names to render functions; the whole view re-renders on every store change.
- `js/store.js`: a single `state` object with `subscribe`/`emit`. Mutations (`createBook`, `updateBook`, …) call the API and then emit. `applyReadingRules` holds the reading logic: auto Reading/Read status, start/finish dates, page clamping. **Authors and series are derived** from books here (`authorsList`, `seriesList`); there are no tables for them. `authorNames()` splits co-authors on `,`/`&`.
- **Series total** ("Books in series", `books.series_total`) belongs to the whole series: the server copies it to every book in that series (case-insensitive) on add/update, and `createBook` inherits it. With a total set, novellas (non-integer numbers) don't count toward "read X of N".
- **Custom goals** (`reading_goals` table, `/api/goals/custom`) and **challenges** (`challenges` table with a JSONB `items` list, `/api/challenges`, full-replacement PUT) are the only per-user tables besides books. Goal progress and challenge completion are computed client-side (`goalProgress`, `challengeProgress`): a challenge prompt is done when ticked or when its linked book is Read. New challenges are created only from a book's Edit details (the Challenges page's "New challenge" button just picks the book); a challenge page is a board of book-shaped slots, and prompts named after a colour get that colour (`promptColour` in `challenges.js`).
- **Dashboard** (`dashboard.js`, designed from the owner's sketch): Currently Reading / TBR / Completed, reading streak + month calendar, reading goals (yearly + custom goals), quote of the day (picked by date, so it changes daily), Next Up, Most Recent Entries. The charts (books per month, genres, completion) and a summary row live on the **Statistics** page (`statistics.js`, `#/statistics`); the Book Shelf is the Library's default view (`bookcase()`/`shelfBook()` in `ui.js`, with a Shelf/Grid switch remembered in localStorage). Its leafy vine with fairy lights (`shelfVine()`, `.shelf-vine`) is `aria-hidden`, has `pointer-events: none` and sits in its own band above the first row, so it never covers the hearts or links.
- **Journal / "Log your reading"** (`logReading.js`, opened from the top bar, the dashboard and the book page): a session is saved by `updateBook(id, changes, { session: { date, note } })`; the server (`parseSession` in `bookController`) writes a `reading_activities` row with `session_date` and `note` when pages go up **or** a note is written. The streak and calendar come from `statistics.readingDays`.
- **Next Up**: `users.next_up` (max 3 book ids, `/api/next-up`); only books still To Be Read are shown, so starting a book frees its slot.
- `js/api.js`: fetch wrapper. `normalizeBook`/`toPayload` convert between DB rows and UI objects. When you add a book field, update `parseBook` + `COLUMNS` (server) and `normalizeBook` + `toPayload` (client).
- `js/ui.js`: `h(tag, props, ...children)` builds DOM with `textContent`. Don't use `innerHTML` with user data (it's only used for static SVG icons). Also has `modal`/`confirmDialog`/`toast`, `cover()` and rating inputs.
- `index.html` lists every app module as `<link rel="modulepreload">`; add new modules there too.
- The login state in the browser is just `localStorage.user` (name/email/theme, used only for display). The token itself is never readable by JS.

## Theming and colours

- All colours are CSS custom properties in `public/css/style.css` (`:root` = the default "cream" theme, built on the owner's palette #D8A2A2 rose, #FFDCDC blush, #FFF9D6 cream, #8EA66B sage; fonts Fraunces + Nunito Sans). Presets override them in `:root[data-theme="blush|sage|lavender|night"]`. Token names are roles: `--rose`/`--blush` = main accent, `--sage` = progress/"read". Use tokens (`--text`, `--muted`, `--surface`, `--rose-deep`, …), not hardcoded colours. The tokens have been tuned for WCAG AA contrast across all themes.
- Botanical decorations are CSS masks (`--sprig`, `--leaf-icon`) coloured by `--leaf`/`--sage`, on pseudo-elements only (body corners, page titles, dashboard cards, empty states, auth card), so they never touch the DOM. Don't put `backdrop-filter`/`transform`/`filter` on `.topnav`: it would become the containing block for the fixed mobile tab bar.
- The preset list exists in four places that must stay in sync: `style.css`, `public/js/theme.js` (`PRESETS`), `public/js/theme-boot.js` and `src/controllers/themeController.js` (`PRESETS`).
- `theme-boot.js` is a classic (non-module) script in every page's `<head>`. It applies the cached theme before first paint; `theme.js` reuses it via `window.mbsApplyTheme`. The theme is saved per account (`users.theme` JSONB) and returned at login.
