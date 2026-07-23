# Multi-stage production build for Next.js 16, following the standard Next.js
# Docker pattern (output: "standalone" in next.config.ts), adapted for this repo's
# Prisma + sharp dependencies. See docs/production-deployment.md for the full
# build-arg vs runtime-env split this Dockerfile relies on.

FROM node:22-alpine AS deps
# libc6-compat: some native deps (sharp's prebuilt binaries, Prisma's query
# engine) need this under musl/Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: skips postinstall's `simple-git-hooks` (no .git in a
# container image) and its `prisma generate` (run explicitly in the builder
# stage instead, after the full source — including prisma/schema.prisma — is
# copied in).
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not read
# at runtime — they must be passed as build args (wired via docker-compose's
# build.args), not just container environment variables. Everything else
# (DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HUGGINGFACE_API_TOKEN, etc.) is
# runtime-only and must never be passed as a build arg or baked into the image.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

RUN npx prisma generate
RUN npm run build

# Next.js's standalone file-tracing doesn't always pick up Prisma's generated
# query-engine binary automatically — copy it explicitly so `node server.js`
# can find it in the runner stage.
RUN cp -r node_modules/.prisma .next/standalone/node_modules/.prisma \
  && cp -r node_modules/@prisma .next/standalone/node_modules/@prisma

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# scripts/cron-runner.mjs — plain Node, no dependencies beyond builtins, so it
# runs fine outside the traced standalone node_modules. Used by the `cron`
# service (same image, different command).
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=15s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
