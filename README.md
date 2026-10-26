# Finance Tracker

A personal finance web app for Indian Rupees. Multiple users can register and independently track bank accounts, cash and cards; record income and expenses as they happen; move money between their own accounts; and see balances, savings, trends and reports. All times are shown in the user's time zone (default **Asia/Kolkata**).

Designed to run entirely on **free tiers**: Vercel Hobby + MongoDB Atlas Free.

---

## 1. Features

- **Accounts**: bank, savings, salary, cash, digital wallet, credit card, other. Opening balance, rename, archive/restore, delete (only when unused), per-account history.
- **Expenses**: name typed every time, configurable expense type, amount, account, auto-filled date & time (editable for past entries), comment, reference. Search, filter (account / type / date range), sort, paginate, edit, delete with confirmation, details view.
- **Income**: name, amount, receiving account, auto-filled date & time, comment. Same list tools as expenses.
- **Refunds**: recorded against an expense and reduce it (₹1,000 − ₹300 refund = ₹700 net). Refunds can be removed; totals recalculate.
- **Transfers** between your own accounts (written atomically as two linked ledger entries; never income/expense).
- **ATM withdrawals**: choose "simple" (withdrawal = expense, default) or "detailed" (withdrawal = transfer to a Cash account) in Settings.
- **Balance corrections**: dated, reasoned, immutable adjustments once an account has entries.
- **Dashboard**: total balance, period income, expenses, net savings, savings rate, comparison with the previous period, activity chart, spending by type, income by source, balance trend, account balances, recent activity, quick-add buttons.
- **Savings**: read-only, calculated from real activity, with clear definitions of net savings vs. current balance vs. opening balances vs. cumulative position, plus a 12-month history.
- **Reports**: today / week / month / quarter / year / custom range, previous-period comparison, breakdowns, account activity, largest expenses, transaction history, CSV export.
- **Profile & Settings**: name, password change (signs out other devices), currency (INR), time zone, ATM mode, expense-type management, CSV export, delete all financial data, delete account.
- Light/dark/system theme, responsive layout (sidebar on desktop, bottom tabs on phones), toasts, skeletons, empty and error states.

## 2. Technology

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript (strict) |
| UI | Tailwind CSS v4, shadcn/ui (Radix), Lucide icons, Recharts, Sonner toasts, next-themes |
| Forms & validation | React Hook Form + Zod 4 (the same schemas run on client and server) |
| Backend | Next.js Route Handlers on the Node.js runtime |
| Database | MongoDB Atlas Free tier via the official `mongodb` driver (v7) |
| Auth | **Better Auth** (email + password) with `@better-auth/mongo-adapter`. Free, open source, self-hosted, and passwords are hashed by the library |
| Tests | Vitest (unit tests + integration tests against a real MongoDB test database) |

## 3. Architecture

```
src/
  app/
    (auth)/login, register          sign-in / sign-up pages
    (app)/dashboard … settings      authenticated pages (Server Components)
    api/…                           Route Handlers (all mutations, export, auth)
  components/
    app/                            shell, navigation, user menu, quick add
    finance/                        forms, dialogs, tables, charts, cards
    settings/                       settings forms
    ui/                             shadcn/ui primitives
  lib/                              client-safe code
    money.ts                        paise parsing/formatting (no floats)
    dates.ts                        time-zone aware periods & buckets
    finance/ledger.ts               THE ledger rules (+ matching Mongo expressions)
    validation/schemas.ts           Zod schemas shared by client and server
  server/                           server-only code
    db/                             Mongo client singleton, collections, indexes
    services/                       business logic (accounts, transactions, reports, export…)
    http.ts                         authenticated route wrapper, error mapping, CSRF check
    session.ts                      verified-session helpers
  proxy.ts                          optimistic redirect for signed-out visitors
tests/unit, tests/integration
```

- Pages are Server Components. Each page's request-time part sits in a `<Suspense>` boundary (required by Cache Components); **no user data is cached** on the server.
- Every Route Handler goes through `authedRoute()`, which checks the Origin on mutating requests, gets the user from the **verified Better Auth session** (never from the request body), and turns errors into safe JSON.
- Every query is scoped by `userId`. Referenced accounts and expense types are loaded with `{ _id, userId }`, so another user's IDs read as **404 Not Found**.

### Data model (MongoDB)

Better Auth manages `user`, `session`, `account`, `verification` and `rateLimit`. The app adds:

| Collection | Key fields |
| --- | --- |
| `financialAccounts` | `userId`, `name`, `nameKey` (unique per user), `type`, `openingBalancePaise`, `currency`, `isArchived`, `version`, timestamps |
| `transactions` (unified ledger) | `userId`, `accountId`, `type` (`income` · `expense` · `transfer_out` · `transfer_in` · `adjustment`), `amountPaise` (positive int), `name`, `categoryId`, `effectiveAt`, `createdAt`, `updatedAt`, `comment`, `reference`, `refundedPaise` + `refunds[]`, `transferGroupId` + `counterpartyAccountId`, `adjustmentDirection` + `adjustmentReason`, `isCashWithdrawal`, `idempotencyKey`, `version` |
| `expenseTypes` | `userId`, `name`, `nameKey` (unique per user), `isDefault`, `isArchived`, timestamps |
| `userSettings` | `_id = userId`, `currency`, `timezone`, `cashWithdrawalMode` |

Indexes are created automatically on first use (`src/server/db/collections.ts`): user+date, user+type+date, user+account+date, user+category+date, user+transferGroup, and a unique partial index on user+idempotencyKey.

### Ledger convention

All money is **integer paise** (₹150.50 → `15050`), parsed from strings without floating point. Each ledger entry stores a positive amount; its effect is derived from its type:

| Type | Balance effect | Counts as income | Counts as expense |
| --- | --- | --- | --- |
| income | + amount | yes | no |
| expense | − (amount − refunded) | no | yes (net of refunds) |
| transfer_out / transfer_in | − / + amount (paired) | no | no |
| adjustment | ± amount | no | no |
| opening balance (on account) | + opening | no | no |

```
balance(account)  = openingBalance + Σ effect(entries)
period income     = Σ income.amount               where effectiveAt ∈ [start, end)
period expenses   = Σ (expense.amount − refunded) where effectiveAt ∈ [start, end)
net savings       = income − expenses
savings rate      = net savings ÷ income × 100     (shown as "—" when income is 0)
```

Balances are **always calculated** from the ledger (one aggregation per page); there is no stored balance that could drift.

### Accounting decisions

- **Opening balance**: editable until the account has its first entry. After that it's locked, and corrections are recorded as **balance adjustments** (dated, with a reason, not deletable). Accounts with history can only be archived.
- **Refunds** reduce the original expense and count in the **original purchase's period**. They are never income, so they can't be counted twice. The refund date is kept for your records. A refund can't exceed the remaining amount (checked atomically).
- **Transfers**: both legs are inserted, edited and deleted together inside a MongoDB multi-document transaction. Deleting either leg deletes both.
- **ATM withdrawals**: default "simple" mode records an expense in the *Cash Withdrawal* type (don't also record the cash purchases). "Detailed" mode records a transfer to a Cash account, and cash purchases become the expenses.
- **Credit cards**: a credit-card account starts at 0 (or a negative opening balance for what you owe). Purchases are expenses at purchase time, so the balance goes negative (= owed). **Paying the bill is a transfer** from your bank account to the card, never a second expense. Card numbers, CVVs and PINs are never requested.
- **Archived accounts** keep their history and still count in the total balance (transfer the money out first if the account is closed).
- **Future dates** are rejected (more than 5 minutes ahead), so "current balance" only reflects money that has actually moved.
- **Duplicate submissions**: each create form sends a random idempotency key, and a retry or double-click returns the original entry. Edits use an optimistic-concurrency `version` (stale edits get a 409).

## 4. Prerequisites

- Node.js **20.9+** (developed with Node 24) and npm
- A free MongoDB Atlas account and a free Vercel account (for deployment)
- Git and a GitHub account (for deployment)

## 5. Local setup

```bash
npm install
cp .env.example .env.local     # then fill in the values (see below)
npm run dev                    # http://localhost:3000
```

### MongoDB Atlas (free) setup

1. Sign in at <https://cloud.mongodb.com>, create a project, then **Create → Free** cluster (one free cluster per project). Choose a region close to your Vercel region (e.g. Mumbai `ap-south-1` for India).
2. **Database Access → Add New Database User**: username + strong generated password. Grant **"Read and write to any database"**, or, better, a custom role with `readWrite` on just your database (e.g. `finance`) **and** your test database.
3. **Network Access → Add IP Address**: add **your current IP** for local development (see §11 for Vercel).
4. **Connect → Drivers** and copy the `mongodb+srv://…` string. Put the password in it (URL-encode special characters like `@`, `/`, `:`).

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB_NAME` | yes | Database name, e.g. `finance` |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 random characters. Generate with `npx @better-auth/cli secret` or `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Public base URL: `http://localhost:3000` locally, `https://<app>.vercel.app` in production |

Variables are validated at server start (`src/instrumentation.ts`) and on first use. Missing or invalid values produce a clear message listing each problem. None of them are exposed to the browser (no `NEXT_PUBLIC_` variables). `.env*` files are git-ignored except the `*.example` templates.

### Authentication

Better Auth needs no extra setup. Its collections are created automatically in your database. It provides:

- email + password sign-up and sign-in (password hashing by the library, minimum 8 characters)
- httpOnly, SameSite=Lax session cookies (Secure when `BETTER_AUTH_URL` is https), 7-day sessions
- built-in origin checks on auth endpoints, plus rate limiting stored in MongoDB (sign-in 5/min, sign-up 5/5 min, password change and account deletion limited too)
- password change (revokes other sessions) and account deletion (also deletes all financial data)

## 6. Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | Generates route types, then `tsc --noEmit` |
| `npm test` | All tests (integration tests are skipped if no test DB is configured) |
| `npm run test:unit` | Unit tests only (no database needed) |
| `npm run build` / `npm start` | Production build / serve it locally |

### Running the tests

Unit tests (money precision, ledger rules, time-zone period boundaries, CSV escaping) run offline.

The integration tests call the real Route Handlers with real Better Auth sessions against a **separate** MongoDB database. They cover: opening balance, income, expense, net savings, transfers, refunds, back-dated entries, editing, deleting, multi-user isolation (reading, editing, deleting and referencing another user's IDs), money precision, ATM modes, the opening-balance lock and adjustments, midnight/month/quarter/year boundaries in IST, unauthenticated access to every API, export isolation, CSRF origin checks, idempotency and pagination.

```bash
cp .env.test.example .env.test.local   # set MONGODB_URI_TEST (and optionally MONGODB_DB_NAME_TEST)
npm test
```

> ⚠️ The integration tests **delete every document in the test database** before running. The database name must contain `test` (enforced), and it must not be your real database. The Atlas database user needs `readWrite` on it. Your current IP must be allowed in Network Access.

## 7. Deploying (free tiers)

### GitHub

```bash
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Check that `git status` shows no `.env.local` or `.env.test.local` before committing (they are ignored by default).

### Vercel (Hobby)

1. <https://vercel.com/new> → import the GitHub repository. Framework preset: **Next.js** (auto-detected). Build command `next build`, no other settings needed.
2. **Settings → Environment Variables** (Production, and Preview if you use it):
   - `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_SECRET` (use a *different* secret from local)
   - `BETTER_AUTH_URL` = your production URL, e.g. `https://finance-tracker-you.vercel.app` (after the first deploy, set it and redeploy if the URL wasn't known yet)
3. **Settings → Functions → Function Region**: pick the region nearest your Atlas cluster (e.g. Mumbai `bom1` for `ap-south-1`).
4. Deploy, open the URL, register, and create an account to confirm the database connection.

### MongoDB Atlas network access for Vercel

Vercel Hobby functions don't have fixed outbound IP addresses (static IPs are a paid feature), so Atlas can't be restricted to Vercel's IPs. The practical options:

- **Recommended:** add `0.0.0.0/0` in Network Access **and** compensate: a dedicated database user with `readWrite` on only the app database, a long random password, and TLS (always on with `mongodb+srv`). The Vercel ↔ Atlas marketplace integration configures access the same way.
- Keep your personal IP entry for local development and tests; remove stale entries.
- If you later move to a plan with static egress IPs, replace `0.0.0.0/0` with those IPs.

## 8. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Log shows `Invalid environment configuration` | A variable is missing or malformed in `.env.local` or Vercel. The message lists which. Redeploy after changing Vercel variables. |
| "The database is temporarily unavailable" / `MongoServerSelectionError` | Your IP (or `0.0.0.0/0` for Vercel) isn't in Atlas Network Access, the cluster is paused, or the URI/password is wrong (URL-encode special characters). |
| `bad auth : authentication failed` | Wrong DB username/password in `MONGODB_URI`. |
| Sign-in works locally but not in production / "invalid origin" | `BETTER_AUTH_URL` doesn't exactly match the deployed URL (scheme + host, no trailing slash). |
| Logged out immediately on Vercel preview URLs | Previews have different hosts. Set `BETTER_AUTH_URL` for the Preview environment or test on production. |
| "Too many attempts" | Auth rate limit hit. Wait a minute. |
| Build fails on Vercel with type errors | Run `npm run typecheck && npm run build` locally first. |
| Integration tests all "skipped" | `.env.test.local` with `MONGODB_URI_TEST` is missing. |

## 9. Export & backup

- **Settings → Export & backup** or **Reports → Download** gives CSV files (UTF-8 with BOM, so Excel shows ₹ correctly). Formula-looking cells are escaped.
- Exports contain only the signed-in user's data.
- **Backups are not guaranteed on the free tier.** Atlas lets you *enable* daily snapshots on Free clusters (retaining up to four), but that's not on by default and has no point-in-time restore. Keep independent copies: export the transactions CSV regularly (e.g. monthly). For a full database copy you can use `mongodump` with your connection string.

## 10. Free-tier limits (checked October 2026; check the providers' pages for changes)

**MongoDB Atlas Free cluster:** 0.5 GB storage (data + indexes), max 500 connections, 100 operations/second (excess is throttled), 10 GB in / 10 GB out data transfer per rolling 7 days, one free cluster per project, no network peering/private endpoints, paused after 30 days with zero connections, aggregations can't spill to disk. This app's data per user is small (a few hundred bytes per transaction), so 0.5 GB holds a very large personal history.

**Vercel Hobby:** personal, non-commercial use only. Monthly included usage: 1,000,000 function invocations, 4 hours of active CPU, 360 GB-hrs of provisioned memory, 100 GB of fast data transfer. Max function duration 300 s, runtime logs kept for 1 hour, no static IPs. If you exceed a limit, the feature can be paused until the 30-day window resets.

Monitor usage in the Atlas *Metrics* tab and Vercel *Usage* page. The app keeps load low with a pooled singleton client (max 10 connections per instance), indexed and user-scoped queries, server-side pagination (20 rows), aggregations instead of loading transactions into the browser, and no scheduled jobs.

## 11. Security notes

- Authorization runs on the server on every request. The proxy redirect is only a convenience.
- User IDs come only from the verified session. A `userId` sent in a request body is ignored.
- Cross-user access returns 404 (no ID probing). Malformed ObjectIds also return 404.
- Mutating API calls from another origin are rejected (403), on top of SameSite cookies and Better Auth's own origin checks.
- Error responses never include stack traces, environment values or raw database errors. Server logs omit request bodies.
- The app never asks for bank passwords, UPI PINs, card numbers or CVVs.

## 12. Known limitations

- Single currency (INR). The currency setting exists but only INR is offered.
- Email verification and password reset by email aren't enabled (they need an email-sending service). A user who forgets their password can't recover it yet.
- No recurring/scheduled transactions, budgets or bank-statement import.
- Credit cards are tracked without interest, statement cycles or credit limits.
- Rate limiting depends on the `x-real-ip` header set by Vercel. On other hosts, adjust `advanced.ipAddress` in `src/lib/auth.ts`.
