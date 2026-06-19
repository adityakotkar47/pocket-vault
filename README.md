# PocketVault

A production-realistic, multi-tenant personal finance transaction extractor. Paste raw bank-statement text and get back a structured, deduplicated, organization-scoped transaction with a confidence score.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Hono (TypeScript) on Bun |
| Database | PostgreSQL + Prisma ORM |
| Auth (Backend) | Better Auth — email/password + organizations + JWT (ES256) plugins |
| Auth (Frontend) | Auth.js (NextAuth v5) — Credentials provider synced to the Better Auth JWT |
| Frontend | Next.js 15 App Router + Server Components + shadcn/ui + Tailwind CSS |
| Tests | Jest (parsing + auth + isolation) |

## Better Auth Integration (Isolation & Scalability)

Better Auth is the system of record: it owns users, scrypt-hashed passwords, and a personal **organization** provisioned per user via a `user.create` hook. Every transaction is scoped by the `organizationId` baked into the **verified ES256 JWT claim** at mint time — never from request input — so a forged or swapped token cannot widen access. Auth is **stateless** (JWTs verified via JWKS, zero per-request DB hits), and isolation is enforced at three layers: the JWT claim, the Prisma `where organizationId` filter, and a Postgres Row-Level Security policy.

## Repository Structure

```
pocket-vault/
├── apps/
│   ├── api/          # Hono + Better Auth + parser + seed + tests
│   └── web/          # Next.js 15 + Auth.js + shadcn/ui
└── packages/
    └── db/           # Prisma schema + generated client + migrations
```

## Setup

```bash
# 1. Install
bun install

# 2. Start Postgres
docker compose up -d

# 3. Create env files (see .env.example values below)
cp apps/api/.env.example      apps/api/.env
cp apps/web/.env.example      apps/web/.env.local
cp packages/db/.env.example   packages/db/.env
# Generate secrets with: openssl rand -base64 32

# 4. Migrate + seed two test users
bun run db:migrate
bun run db:seed

# 5. Run both apps
bun dev
```

API → http://localhost:3001 · Web → http://localhost:3000

Run backend only: `bun dev:api` · Run frontend only: `bun dev:web`

## Environment Variables

JWT signing keys are **auto-generated** by Better Auth (ES256 keypair stored as JWKS in the DB) — there are no key env vars to manage.

**`apps/api/.env`**
```env
DATABASE_URL="postgresql://pocketvault:pocketvault@localhost:5432/pocketvault"
BETTER_AUTH_SECRET="<openssl rand -base64 32>"
BETTER_AUTH_URL="http://localhost:3001"   # public API base URL (JWKS issuer)
WEB_ORIGIN="http://localhost:3000"        # CORS / trusted origin
PORT=3001
```

**`apps/web/.env.local`**
```env
AUTH_SECRET="<openssl rand -base64 32>"   # different from BETTER_AUTH_SECRET
AUTH_TRUST_HOST=true
AUTH_URL="http://localhost:3000"
API_URL="http://localhost:3001"
```

**`packages/db/.env`**
```env
DATABASE_URL="postgresql://pocketvault:pocketvault@localhost:5432/pocketvault"
```

All variables are required — the apps fail fast at boot if any is missing.

## Test Users (created by `bun run db:seed`)

| Email | Password |
|---|---|
| alice@pocketvault.local | `password123` |
| bob@pocketvault.local | `password123` |

Both are created through Better Auth's real `signUpEmail`, sit in **separate organizations**, and come pre-seeded with the three sample transactions — useful for demonstrating data isolation (log in as one, you can never see the other's rows).

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register (email + password, scrypt-hashed) |
| POST | `/api/auth/login` | — | Sign in → 7-day ES256 JWT (`{ token, user, expiresIn }`) |
| GET | `/api/auth/jwks` | — | Public keys for JWT verification |
| POST | `/api/transactions/extract` | Bearer JWT | Parse text + save transaction (org-scoped, deduped) |
| GET | `/api/transactions?cursor=&limit=` | Bearer JWT | Cursor-paginated list (org-scoped) |
| GET | `/health` | — | Health check |

## Tests

```bash
bun run test
```

Covers the three required areas: **parsing + confidence** (all three sample formats), **auth** (JWKS bearer middleware rejects missing/malformed/wrong-scheme tokens), and **isolation** (org-scoped queries never leak across organizations; per-org dedupe).

## Sample Texts (all three parse)

```
Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50
```
```
Uber Ride * Airport Drop
12/11/2025 → ₹1,250.00 debited
Available Balance → ₹17,170.50
```
```
txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping
```

## Bonus Features

- **Confidence score** — each parse returns a 0–1 score based on which fields (date, amount, description, balance) were extracted.
- **Rate limiting** (`hono-rate-limiter`) — `/api/auth/*` keyed by IP (10/min); `/api/transactions/extract` keyed by authenticated `userId` (30/min).
- **Row-Level Security** — the `transaction` table has a Postgres RLS policy (`org_isolation`) with `FORCE ROW LEVEL SECURITY`; all queries run through `withOrgContext(orgId, fn)` which sets a transaction-local `app.organization_id` that the policy filters on. DB-level isolation complementing the application-layer checks.
- **Scalability** — cursor pagination (composite `createdAt_id` cursor), `@@index([organizationId, createdAt, id])`, stateless JWT auth.

## Deployment

**Backend → Railway (Dockerfile)**
1. New project → Deploy from GitHub repo.
2. Build method: **Dockerfile** → `apps/api/Dockerfile` (root context). On start it runs `prisma migrate deploy` and idempotently seeds the test users, then starts the server — no manual steps.
3. Add Postgres, then set: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (the public API URL), `WEB_ORIGIN` (the Vercel URL).

**Frontend → Vercel**
1. Import repo, set **Root Directory** to `apps/web`.
2. Set: `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `AUTH_URL` (the Vercel URL), `API_URL` (the Railway URL).

| Deployment | URL |
|---|---|
| Frontend (Vercel) | https://pocket-vault-vessify.vercel.app |
| Backend (Railway) | https://pocket-vault-vessify.up.railway.app |
