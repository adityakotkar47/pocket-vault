# PocketVault

A production-realistic, multi-tenant personal finance transaction extractor built as a Bun monorepo. Paste raw bank-statement text, get back a structured, deduplicated, organization-scoped transaction with a confidence score.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime / Package Manager | Bun 1.3+ (workspaces monorepo) |
| Backend | Hono (TypeScript) |
| Database | PostgreSQL 16 + Prisma 7 ORM (driver adapter: `@prisma/adapter-pg`) |
| Auth (Backend) | Better Auth — email/password + organizations/teams + JWT (ES256) + bearer plugins |
| Auth (Frontend) | Auth.js (NextAuth v5) — Credentials provider synced to the Better Auth JWT |
| Frontend | Next.js 15 App Router + Server Components + shadcn/ui + Tailwind CSS |
| Tests | Jest + ts-jest (24 tests: parsing, auth, isolation) |

## Repository Structure

```
pocket-vault/
├── apps/
│   ├── api/          # Hono + Better Auth + parser + seed + tests
│   └── web/          # Next.js 15 + Auth.js + shadcn/ui
└── packages/
    └── db/           # Prisma 7 schema + generated client + migrations
```

## Auth Architecture

Better Auth (on the Hono API) is the system of record — it owns users, organizations, hashed passwords (scrypt), and mints **7-day ES256 JWTs**. Auth.js is a thin session broker on the Next.js side.

**Why ES256?** Better Auth's default JWT algorithm is EdDSA, which the `hono/jwk` verification middleware does not verify reliably. The JWT plugin is therefore configured with `keyPairConfig: { alg: "ES256" }`, and the verification middleware declares `alg: ["ES256"]`.

**Login flow (`authorize()` in the Credentials provider):**

1. `POST /api/auth/sign-in/email` → returns a Better Auth **session token**.
2. `GET /api/auth/token` with `Authorization: Bearer <session token>` → exchanges it for the **ES256 JWT** (this is the token sent on every API call).
3. The JWT payload (`userId`, `organizationId`, `exp`) is decoded and stored, along with `accessToken`, in the Auth.js JWT cookie via the `jwt()` callback.
4. The `session()` callback exposes `session.accessToken` to Server Components.
5. Frontend Server Actions call the API with `Authorization: Bearer <ES256 JWT>`.
6. The Hono API verifies the token statelessly via JWKS (`GET /api/auth/jwks`) — **zero per-request DB hits**.

Registration (`POST /api/auth/sign-up/email`) triggers a Better Auth `user.create` hook that provisions a personal organization (+ owner membership) and stores its id on the user.

## Data Isolation

Every transaction query is scoped by the `organizationId` taken from the **verified JWT claim** — never from request input. A forged or swapped Bearer token cannot widen access, because the `organizationId` is set at JWT mint time from the user's own record. The `Transaction` table also has a `@@unique([organizationId, rawHash])` constraint, so deduplication is **per-organization** (two different orgs can hold the same raw text). This is covered directly by the isolation tests.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3
- [Docker](https://docker.com) (for local Postgres)
- Node.js >= 20 (Jest runs under Node with `--experimental-vm-modules`)

## Local Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd pocket-vault
bun install

# 2. Start Postgres
docker compose up -d

# 3. Copy env files and fill in secrets (generate with: openssl rand -base64 32)
cp apps/api/.env.example      apps/api/.env
cp apps/web/.env.example      apps/web/.env.local
cp packages/db/.env.example   packages/db/.env

# 4. Run migrations + generate the Prisma client
bun run db:migrate

# 5. Seed two test users (each with their own org + 3 sample transactions)
bun run db:seed

# 6. Start both apps
bun dev
```

API → http://localhost:3001 · Web → http://localhost:3000

## Environment Variables

**`apps/api/.env`**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Better Auth signing/session secret |
| `BETTER_AUTH_URL` | Public base URL of the API (used for JWKS + token issuer) |
| `WEB_ORIGIN` | Allowed CORS origin / trusted origin (the web app URL) |
| `PORT` | API port (default 3001) |

**`apps/web/.env.local`**

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Auth.js cookie encryption secret |
| `AUTH_TRUST_HOST` | `true` (required for Auth.js behind a host) |
| `AUTH_URL` | Public base URL of the web app (also sent as `Origin` to Better Auth) |
| `API_URL` | Base URL of the Hono API (used by Server Actions) |

**`packages/db/.env`**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Used by Prisma CLI for migrations/generate |

> All of the above are **required** — the apps fail fast at boot if any is missing (no silent localhost fallbacks).

## Test Users (after `bun run db:seed`)

| Email | Password |
|---|---|
| alice@pocketvault.local | `password123` |
| bob@pocketvault.local | `password123` |

Both are created through Better Auth's real `signUpEmail` API, so they log in exactly like a normal user and sit in separate organizations (useful for demonstrating isolation).

## Running Tests

```bash
bun run test          # from the repo root (runs the Jest suite via the api workspace)
```

24 tests across three suites:
- **Parsing + confidence** (`parser.test.ts`) — all three sample formats + confidence scoring.
- **Auth** (`auth.test.ts`) — the JWKS bearer middleware rejects missing / malformed / wrong-scheme tokens (401).
- **Isolation** (`isolation.test.ts`) — org-scoped queries never leak across organizations; per-org dedupe.

> Jest runs under Node with `NODE_OPTIONS=--experimental-vm-modules` (wired via `cross-env`) because the Prisma client is generated as an ES module.

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

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/sign-up/email` | — | Register (Better Auth) |
| POST | `/api/auth/sign-in/email` | — | Sign in → Better Auth session token |
| GET | `/api/auth/token` | Bearer session token | Exchange session token for a 7-day ES256 JWT |
| GET | `/api/auth/jwks` | — | Public keys for JWT verification |
| POST | `/api/transactions/extract` | Bearer JWT | Parse text + save transaction (org-scoped, deduped) |
| GET | `/api/transactions?cursor=&limit=` | Bearer JWT | Cursor-paginated list (org-scoped) |
| GET | `/health` | — | Health check |

> The rubric lists `/api/auth/register` and `/api/auth/login`; this project uses Better Auth's native endpoints (`sign-up/email`, `sign-in/email`) instead of hand-rolled wrappers.

## Scalability Notes

- **Cursor pagination** on `GET /api/transactions` using a composite `createdAt_id` cursor (stable under inserts) and an `@@index([organizationId, createdAt, id])`.
- **Stateless auth** — JWTs verified via JWKS, so no session lookup per request.
- **Rate limiting** (bonus) via [`hono-rate-limiter`](https://github.com/rhinobase/hono-rate-limiter), emitting standard `RateLimit-*` headers and a JSON `429`:
  - `/api/auth/register` + `/api/auth/login` — keyed by client IP (`x-forwarded-for`), 10/min, to blunt signup spam and credential stuffing.
  - `/api/transactions/extract` — keyed by the authenticated `userId` from the JWT (organisation-isolated), 30/min.
  - Note: the default store is in-memory (resets on restart, per-instance). `hono-rate-limiter` supports external stores (e.g. Redis) as a drop-in for horizontal scaling.

## Deployment

### Backend → Railway (Dockerfile)

1. New Railway project → **Deploy from GitHub repo**.
2. Build method: **Dockerfile** → `apps/api/Dockerfile` (root context). Migrations run automatically on container start.
3. Add a Postgres database (Railway plugin / Neon / Supabase) and copy its connection string.
4. Set environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `https://your-api.up.railway.app` |
| `WEB_ORIGIN` | `https://your-app.vercel.app` |
| `PORT` | `3001` |

### Frontend → Vercel

1. Import the repo, set **Root Directory** to `apps/web`.
2. Set environment variables:

| Variable | Value |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` (different from `BETTER_AUTH_SECRET`) |
| `AUTH_TRUST_HOST` | `true` |
| `AUTH_URL` | `https://your-app.vercel.app` |
| `API_URL` | `https://your-api.up.railway.app` |
