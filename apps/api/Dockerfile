# ── Stage 1: Builder ─────────────────────────────────────────────────────────
# Build application with all dependencies
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/db/prisma ./packages/db/prisma

ENV DATABASE_URL="postgresql://x:x@localhost:5432/x"

RUN bun install --no-frozen-lockfile

COPY tsconfig.json ./
COPY apps/api ./apps/api
COPY packages/db/src ./packages/db/src
COPY packages/db/prisma.config.ts ./packages/db/

# ── Stage 2: Runner ──────────────────────────────────────────────────────────
# Production runtime with minimal footprint
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app ./

CMD ["sh", "-c", "cd packages/db && bun x prisma migrate deploy && cd /app && (bun run apps/api/src/seed.ts || true) && exec bun run apps/api/src/index.ts"]
