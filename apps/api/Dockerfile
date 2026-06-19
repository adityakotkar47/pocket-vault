# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/

RUN bun install

# Copy source
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/db ./packages/db

# Generate Prisma client (dummy URL — generate only reads schema, never connects)
ENV DATABASE_URL="postgresql://x:x@localhost:5432/x"
RUN cd packages/db && bun x prisma generate

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app ./

# Run migrations, seed test users (idempotent, non-fatal), then start server
CMD ["sh", "-c", "cd packages/db && bun x prisma migrate deploy && cd /app && (bun run apps/api/src/seed.ts || true) && exec bun run apps/api/src/index.ts"]
