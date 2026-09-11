# Shelfmark

A circulation desk for a college library. You print a QR label for every book, and at the desk you scan it to issue or return the book. Every loan gets recorded with who took it, when, and when it's due back.

I built this to handle all the core workflows of a college library desk. I also ended up adding an admin dashboard and an AI-powered natural language search, just to see how well it would work. There's a section further down about the extra features I threw in because a few of those ended up being my favourite parts.

- Live demo: [https://1dd0b2dbf7519d.lhr.life](https://1dd0b2dbf7519d.lhr.life)
- Demo video: _add the video link here_

## Running it locally

You need Node 20.19 or newer (I used Node 22). Then, from this folder:

```bash
npm install
npm run dev
```

Open http://localhost:5173 and sign in with one of the demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@shelfmark.dev | Admin@123 |
| Librarian | librarian@shelfmark.dev | Librarian@123 |

The login page also has buttons that fill these in for you.

You don't have to install PostgreSQL. When no `DATABASE_URL` is set, the server runs PGlite, which is real Postgres compiled to WebAssembly, and keeps its files in `server/data/`. On the first run it loads 27 real books (proper ISBNs), a handful of SRM-style borrowers and two weeks of history, so the dashboard has overdue books and a chart from the start. Delete `server/data/` if you ever want to start fresh.

Other useful commands:

```bash
npm test                      # server + client tests
npm run coverage -w server    # coverage report for the API
npm run build                 # production build of the React app
npm start                     # serve the API and the built app on :4000
```

### Environment variables

Nothing is required for local development. If you want smart search to use a real model, or you want to point at a real database, copy `server/.env.example` to `server/.env` and fill in what you need. Every variable is explained in that file. The ones that matter most:

- `GEMINI_API_KEY`: a free key from https://aistudio.google.com/apikey turns on AI search. Without it the app falls back to its own rule-based parser, so nothing breaks.
- `DATABASE_URL`: a Postgres connection string (I used Neon's free tier for the deployed version).
- `JWT_SECRET` and `QR_SECRET`: required in production. Generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

`.env` is in `.gitignore`. Please keep it that way.

## Tech stack

| Part | What I used | Why |
| --- | --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 | Fast dev server, and types caught a lot of my mistakes early |
| Data fetching | TanStack Query | Caching and refetch-after-mutation without writing it myself |
| QR scanning | qr-scanner | Decodes in a web worker, works with the camera and with photos |
| Backend | Node.js, Express 5 | Express 5 handles errors thrown from async routes, so no try/catch everywhere |
| Database | PostgreSQL (`pg`), PGlite for local dev and tests | Same SQL everywhere, and the constraints do real work (more on that below) |
| Validation | zod | One schema gives me both validation and a clear error message per field |
| Auth | bcrypt + JWT in an httpOnly cookie | The page's JavaScript can't read the session token |
| QR codes | qrcode | PNG and SVG labels |
| Excel export | exceljs | Real .xlsx with formatting, not a renamed CSV |
| AI | Gemini 2.5 Flash (or Claude), with an offline fallback | Gemini has a free tier, which matters for a student project |
| Tests | Vitest, Supertest, Testing Library | |

The backend is a plain Express API talking to Postgres.

## How it works

### The QR label

Each book gets a UUID when it's added. The QR code doesn't contain the title or the ISBN. It holds a small signed string:

```
SHELFMARK:1:<book uuid>:<signature>
```

The signature is the first 16 hex characters of an HMAC-SHA256 of the book id, keyed with `QR_SECRET`. When a code is scanned the server recomputes it and compares with `timingSafeEqual`. A QR code someone made by hand, or one copied and edited, gets rejected as an invalid label. The label also stays valid if you fix a typo in the title, since the title isn't in it.

Staff can download a label as PNG or SVG from the book's page, or print a whole sheet of them (3 across on A4, with dashed lines to cut along).

### Scanning

There are three ways to get a book into the desk, because the camera isn't always an option:

1. The device camera. The scanner ignores the same code for 2.5 seconds, so holding a label in front of it doesn't fire ten requests.
2. A photo of the label (useful on laptops without a webcam).
3. Typing the Book ID or ISBN.

### Issuing a book

The librarian types the borrower's registration number and name, picks a loan period (7, 14, 21 or 30 days) and scans the books one after another. Each one gets a "date due" slip on screen, with a stamp animation I'm a bit too proud of.

The server does all of this in one database transaction:

1. Verify the QR signature, or look the book up by code.
2. Check the borrower doesn't already have a copy of this book and is under the limit (5 books by default).
3. Take a copy: `UPDATE books SET available_copies = available_copies - 1 WHERE id = $1 AND available_copies > 0`. If that updates zero rows, the book isn't available.
4. Insert the transaction with the issue timestamp, due date, borrower and the staff member who issued it.

Step 3 is the part I spent the most time on. Checking availability first and updating afterwards has a race: two librarians scanning the last copy at the same moment would both see "1 available". Doing the check inside the `UPDATE` makes Postgres settle it, and a test fires parallel requests at the last copy to make sure exactly one wins. The database backs this up too: a CHECK constraint keeps `available_copies` between 0 and `total_copies`, and a partial unique index stops the same borrower from holding two open loans of one book, even if the application code had a bug.

### Returning a book

Scan the book in Return mode. If only one copy of it is out, it's returned straight away. If several people have that book, the desk asks which borrower is returning it. Returns are stamped with the time, and anything late shows how many days over it was (partial days round up, so one hour late counts as one day) and the fine so far (₹5 per day by default).

### Error Handling

| Situation | What happens |
| --- | --- |
| Invalid or tampered QR | `INVALID_QR`, "That QR code isn't a Shelfmark book label" |
| Book has no copies left | `BOOK_UNAVAILABLE` |
| Same borrower, same book twice | `ALREADY_BORROWED` |
| Returning a book nobody has | `NOT_ISSUED` |
| Returning the same loan twice | `ALREADY_RETURNED` |
| Borrower at their limit | `BORROWER_LIMIT_REACHED` |
| Bad form input | `VALIDATION_ERROR` with a message per field |

Every error comes back as JSON with a code and a message a librarian can read, and the UI shows that message instead of "Something went wrong".

### Exports

The transactions page exports exactly what's on screen (same filters) as CSV or Excel, with these columns: Book Title, Author, Book ID, Issued To (User ID), Issued To (Name), Issue Timestamp, Due Date, Return Timestamp, Current Status, Days Overdue.

The Excel file has a header row that stays put when you scroll, filters on every column, overdue rows highlighted in red, and a second sheet with a summary. The CSV starts with a UTF-8 BOM so Excel shows ₹ and non-English names properly. Any cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe. Otherwise a borrower named `=HYPERLINK(...)` could run a formula on whoever opens the report (CSV injection).

### The admin dashboard

The dashboard opens with the number that matters most, how many books are overdue right now, and then:

- totals: titles, copies, on the shelf, out on loan, overdue, and how many people currently have books
- overdue loans, most overdue first, with the borrower's contact and the fine so far
- books due in the next two days
- an issues vs returns chart for the last 14 days (it can also be read as a table)
- recent activity at the desk, and the most borrowed books
- everything currently on loan with borrower details, searchable
- a one-click Excel report

Transactions have their own page, with filters for status (out now, overdue, returned), free text (book, borrower name or ID) and a date range.

### AI search in plain words

The catalogue has a second search mode called "Ask in plain words". You can type something like:

> programming books on the shelf right now

and it becomes real filters: category Technology, availability Available. The model's answer is never trusted as it is. It goes through a zod schema, the category has to be one the library actually has (if the model invents one, it's moved to a keyword instead), and keywords that only repeat the category get dropped. I added that last rule after "programming" kept filtering out *Clean Code* for not having the word "programming" in its title.

There's a second AI feature in the add-book form: type a title and author, and it suggests a shelf category, preferring categories you already use.

It runs on Gemini 2.5 Flash by default (about 2 seconds per request once I turned off its "thinking" mode, which this kind of small extraction doesn't need). Claude works as well if you set `ANTHROPIC_API_KEY`. If there's no key, or the API is down or rate-limited, the same features use an offline rule-based parser. It's dumber, but the search box never just fails.

## Some extra things I added

I didn't strictly need to build these, but I added them because they either make the desk nicer to use or they're what I'd worry about if this ran in a real library.

- Staff accounts with two roles. Librarians issue, return and manage books; admins also manage staff. Removing a staff member locks them out immediately, not when their session runs out.
- Live updates. When someone issues a book at one desk, every other open screen updates within a second (Server-Sent Events), and there's a small "Live" dot showing the connection.
- Borrower limit, custom loan periods and late fines, all configurable through environment variables.
- ISBN checksum validation. Typos in an ISBN-10 or ISBN-13 get caught when adding a book. Library-specific IDs like `SRM-CSE-0142` work too.
- Books with loan history get archived instead of deleted, so old transactions and reports still make sense.
- Printable label sheets, for a whole category or for a selection.
- A mobile layout with the Scan button in the middle of the bottom bar, where your thumb already is.
- Dark mode, and the app respects reduced-motion settings.
- A beep on each scan (can be muted), so you don't have to look at the screen while scanning a stack of books.
- Security basics: bcrypt passwords, httpOnly SameSite cookies, rate limiting on login and on the AI endpoints, helmet with a Content Security Policy, and parameterised SQL everywhere.
- Zero-setup local database (PGlite) plus demo data, so anyone reviewing this can run it in two commands.

## Decisions I made (and why)

- Postgres over MongoDB. Loans are relational: a transaction belongs to a book, a book has copies, a borrower has a limit. I wanted the database to enforce the rules (constraints, a partial unique index, transactions) instead of hoping the code always gets them right.
- A signed QR payload instead of just the ISBN. Plain ISBNs would let anyone print a working code from the back of a book. Signing costs one HMAC and makes labels impossible to forge.
- One server for everything. In production Express also serves the built React app, so the frontend and API share an origin. That keeps the session cookie first-party and means there's no CORS config to get wrong.
- Cookies instead of localStorage for the session. An httpOnly cookie can't be read by JavaScript, so even an XSS bug couldn't steal a session.
- SSE instead of WebSockets. Updates only go one way (server to screens), and SSE reconnects by itself and works through most proxies without extra setup.
- AI with a fallback. An AI feature that breaks the search box when the free tier is overloaded is worse than no AI feature, so the rule-based parser is always there underneath.

## What I learned

- Race conditions are real even in a small app. "Check, then update" is a bug the moment two requests arrive together, and the fix was to let the database do the check.
- Constraints and partial unique indexes in Postgres. I didn't know you could make a column unique only where `returned_at IS NULL`.
- How HMAC signing works, and why comparisons should be constant-time.
- Getting structured JSON out of an LLM, and why you still validate it afterwards.
- CSV injection. I had no idea a CSV file could be dangerous.
- Time zones. "Today" on the dashboard means today in India, not in UTC. The server runs every date calculation in `Asia/Kolkata`, which is configurable.
- Testing an API end to end with Supertest against an in-memory Postgres, so tests are fast and don't need a database server.

## Tests

```bash
npm test
```

- 114 API tests cover auth and roles, the book CRUD and search, issuing and returning (including the race on the last copy), every error case in the table above, exports, the dashboard numbers, the AI wrapper with fake providers, and boot/config. Statement coverage is around 94%.
- 17 frontend tests cover the formatting helpers, the API client, and the scanner fallbacks (typed Book ID, photo upload, photo without a QR code).

The API tests run against PGlite in memory, so they need no setup. I also ran the main flows through the real `pg` driver over a Postgres connection before deploying.

## Deploying (Render + Neon)

This is how I'd put it online for free:

1. Create a free Postgres database on https://neon.tech and copy the connection string (it ends in `?sslmode=require`).
2. Push this project to GitHub.
3. On https://render.com choose New > Blueprint and pick the repo. It reads `render.yaml`, which sets up the build, the start command and the health check, and generates `JWT_SECRET` and `QR_SECRET` for you.
4. When Render asks, paste the Neon string into `DATABASE_URL` and your Gemini key into `GEMINI_API_KEY`.
5. Deploy. The schema is created automatically on first boot.

`SEED_DEMO` is `true` in `render.yaml` so reviewers can sign in with the demo accounts. For a real library, set it to `false` and set `ADMIN_EMAIL` / `ADMIN_PASSWORD` instead. That creates the first admin, who can add the other staff from the Staff page.

The free Render plan sleeps after 15 minutes without traffic, so the first request after a break takes around 30 seconds.

## Project layout

```
shelfmark/
  server/
    src/
      db/schema.sql      tables, constraints and indexes
      routes/            HTTP layer: validation, status codes
      services/          the actual rules (circulation.js is the heart of it)
      services/ai/       Gemini, Claude and offline search
      lib/               QR signing, ISBN checks, CSV, small helpers
    tests/
  client/
    src/
      pages/             one file per screen
      components/        scanner, due slip, chart, shared UI
      lib/               API client, auth, formatting
  render.yaml
```

## Known limitations

- Borrowers are identified by the ID typed at the desk. There's no separate student database or student login. A real deployment would hook into the college's ERP.
- Logging out clears the cookie, but a stolen session token stays valid until it expires (8 hours). Deleting a staff account cuts it off immediately though.
- There are no reminder emails yet, even though the contact field is stored. That would be the next thing I'd build.
