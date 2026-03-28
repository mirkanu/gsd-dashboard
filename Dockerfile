# ── Stage 1: Install server production deps ───────────────────────────
FROM node:22-alpine AS server-deps
WORKDIR /app
COPY package.json package-lock.json ./
# cache-bust: 2026-03-28T18
RUN npm ci --omit=dev

# ── Stage 2: Build React client ───────────────────────────────────────
FROM node:22-alpine AS client-build
# cache-bust: 2026-03-28T18
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Fail fast if critical files are missing (catches uncommitted file bugs)
RUN test -f scripts/patch-dequal.cjs || (echo "ERROR: client/scripts/patch-dequal.cjs missing — did you forget to commit?" && exit 1)
RUN npm run build

# ── Stage 3: Production runtime ───────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY --from=server-deps /app/node_modules ./node_modules/
COPY package.json ./
COPY server/ ./server/
COPY gsd-projects.json ./
COPY scripts/ ./scripts/
COPY statusline/ ./statusline/
COPY --from=client-build /app/client/dist ./client/dist/

RUN mkdir -p data

EXPOSE 4820

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
