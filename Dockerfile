# ── Stage 1: Install server production deps (with native build tools) ──
FROM node:20-alpine AS server-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Build React client ───────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 3: Production runtime ───────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=server-deps /app/node_modules ./node_modules/
COPY package.json ./
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY statusline/ ./statusline/
COPY --from=client-build /app/client/dist ./client/dist/

RUN mkdir -p data

EXPOSE 4820

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
