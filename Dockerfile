# syntax=docker/dockerfile:1.7
#
# BreakFix Triage — production container for the Next.js app.
#
# Two-stage build:
#   1. builder: installs deps, generates the Prisma client, builds Next.js
#   2. runner:  minimal runtime image that runs `prisma migrate deploy`
#               at startup and then `next start`
#
# Designed to run under docker compose on Unraid (or any Docker host).

# ---------- builder ----------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install dependencies first so docker can cache this layer.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy the rest of the source and build.
COPY . .
RUN npx prisma generate
RUN npm run build

# ---------- runner ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user for runtime.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy the built app + node_modules (needed for next start + prisma CLI).
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs

USER nextjs
EXPOSE 3000

# tini is PID 1 so Next.js gets clean SIGTERMs from docker stop.
ENTRYPOINT ["/sbin/tini", "--"]

# On each start:
#   1. sync the Prisma schema to the database. Phase 1 uses `prisma db push`
#      instead of `migrate deploy` because no migration history has been
#      committed to the repo yet. We'll switch to proper migrations before
#      production cutover (see docs/MIGRATION_PLAN.md). `db push` is
#      idempotent — running it on a DB that already matches the schema is
#      a no-op.
#   2. run the idempotent bootstrap script (creates an admin if none exists,
#      never crashes the container).
#   3. launch next start.
# Schema sync failures should crash the container, so we chain with &&.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx prisma/bootstrap.ts && node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000"]
