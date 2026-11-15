# MyBookShelf

A personal reading journal. Keep track of the books you own and want to read, log your reading sessions, build a streak, set goals and take on reading challenges.

Built with Express 5 and PostgreSQL, plus a plain JavaScript frontend with no framework and no build step. Deployed on Vercel, with the database on Neon.

## Features

- **Library**: every book on a bookshelf or in a grid. Each book has its status (To Be Read, Reading, Paused, Read, DNF), format, genres and sub-genres, tropes, content warnings, age category, series, rating, review, favourite quotes and a cover. Covers can be uploaded or found through a Google Books search.
- **Dashboard**:
  - currently reading, To Be Read and completed books, with covers
  - reading streak with a month calendar
  - yearly, monthly and custom reading goals
  - quote of the day, picked from your saved quotes
  - Next Up list (up to 3 books)
  - your most recent journal entries
- **Log your reading**: record the pages you read, a note and the date. These entries feed the streak, the statistics and the Reading Recap.
- **Statistics**:
  - books read per month
  - genres you've read
  - average completion
  - pages read this week and month
  - **Reading Recap**: a calendar where you pick any past day to see what you read on it
- **Authors and Series**: built automatically from your books. Series show "read X of N".
- **Challenges**: reading challenges you design yourself, or start from a template (genres, A–Z, tropes, around the world, rainbow). Each spot can have matching rules, so the app suggests books from your shelf that fit. Finishing a book offers to fill the spots it unlocks.
- **Themes**: several colour presets, saved to your account.
- **Accounts**: sign up, log in, reset your password by email, and delete your account along with all its data.

## Tech stack

| Part | Uses |
| --- | --- |
| Server | Node.js 22, Express 5 |
| Database | PostgreSQL (local for development, Neon in production) |
| Frontend | Vanilla ES modules, HTML and CSS (no bundler) |
| Auth | JWT in an HttpOnly cookie, bcrypt password hashes |
| Covers | Vercel Blob storage |
| Email | Nodemailer over SMTP (password resets) |
| Tests | Playwright + TypeScript end-to-end tests |

## Getting started

### Requirements

- Node.js 22
- PostgreSQL running locally

### Setup

```bash
npm install
cp .env.example .env      # then fill in the values
```

Create an empty database (the name must match `DB_NAME` in `.env`), then apply the migrations:

```bash
npm run migrate
npm run dev               # http://localhost:3000
```

### Environment variables

All of these are listed, with comments, in `.env.example`.

| Variable | What it's for |
| --- | --- |
| `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT` | Local PostgreSQL |
| `DATABASE_URL` | Hosted database (Neon). Takes priority over the `DB_*` values when set; leave it unset locally |
| `JWT_SECRET` | Signs login sessions |
| `GOOGLE_BOOKS_API_KEY` | Book search and cover lookup |
| `BLOB_READ_WRITE_TOKEN` | Cover uploads (Vercel Blob, public store) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Password reset emails. Without them, reset links are printed in the server console instead |
| `APP_URL` | Optional: the site address used in emailed links |
| `PORT` | Optional: server port (default 3000) |

Never commit `.env`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the server with auto-reload (nodemon) |
| `npm start` | Start the server |
| `npm run migrate` | Apply any new `migrations/*.sql` files |
| `npm run test:e2e` | Run the end-to-end tests |
| `npm run test:e2e:report` | Open the HTML report from the last test run |
| `npm run typecheck:e2e` | Type-check the test code |
| `node testGoogleBooks.js` | Check that the Google Books API key works |

## Project structure

```
server.js              Express app (exported for Vercel; listens locally)
src/
  config/db.js         PostgreSQL pool
  routes/              API routes  →  controllers/
  controllers/         Request handling and validation
  middleware/          Auth and upload checks
  services/            Cover storage (Vercel Blob), email
  utils/               Sessions, date handling
migrations/            Numbered SQL migrations
scripts/migrate.js     Migration runner
public/
  index.html           The app (hash routes: #/dashboard, #/library, #/statistics, ...)
  login.html, ...      Sign-in, sign-up and password reset pages
  js/                  ES modules (store.js holds the state, ui.js builds the DOM)
  css/style.css        Styles and theme colours
e2e/                   Playwright tests
```

## Database migrations

Migrations are plain SQL files in `migrations/`, named `NNN_description.sql`. `npm run migrate` applies the ones that haven't run yet, in filename order and each in a transaction, and records them in the `schema_migrations` table. To change the schema, add a new numbered file rather than editing one that has already been applied.

Migrations are **not** run on deploy. Before releasing a change that includes a new migration, take a snapshot branch in Neon and run the migration against production:

```powershell
$env:DATABASE_URL = "<neon connection string>"; npm run migrate; Remove-Item Env:DATABASE_URL
```

## Testing

The end-to-end tests start their own server on port 3210 against the **local** database. As a safeguard, they refuse to run if `DATABASE_URL` is set. Each test signs up a throwaway `@example.test` account and deletes it afterwards.

```bash
npm run test:e2e                                   # run everything
npx playwright test e2e/recap.spec.ts              # one file
npx playwright test --ui                           # interactive mode
npx playwright test --repeat-each=5 --workers=8    # shake out flaky tests
npm run test:e2e:report                            # view the last report
```

## Deployment

Vercel deploys only the `main` branch. Day-to-day work happens on `dev`, which is merged into `main` to release; `vercel.json` turns off deployments for `dev`. Set the same environment variables in the Vercel project, with `DATABASE_URL` pointing at Neon.
