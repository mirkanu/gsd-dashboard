# ── Stage 1: Install server production deps ───────────────────────────
FROM node:22-alpine AS server-deps
WORKDIR /app
COPY package.json package-lock.json ./
# cache-bust: 2026-03-28T18
RUN npm ci --omit=dev

# ── Stage 2: Build MCP server (ESM) ───────────────────────────────────
FROM node:22-alpine AS mcp-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY mcp/package.json mcp/package-lock.json ./mcp/
RUN cd mcp && npm ci
COPY mcp/ ./mcp/
RUN cd mcp && npm run build

# ── Stage 3: Build React client ───────────────────────────────────────
FROM node:22-alpine AS client-build
# cache-bust: 2026-03-28T18
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
COPY client/scripts/ ./scripts/
RUN npm ci
COPY client/ ./
RUN npm run build
RUN sh scripts/verify-build.sh

# ── Stage 4: Production runtime ───────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY --from=server-deps /app/node_modules ./node_modules/
COPY package.json ./
COPY server/ ./server/
COPY gsd-projects.json ./
COPY scripts/ ./scripts/
COPY statusline/ ./statusline/
COPY --from=client-build /app/client/dist ./client/dist/
COPY --from=mcp-build /app/mcp/build ./mcp/build/
COPY --from=mcp-build /app/mcp/node_modules ./mcp/node_modules/

RUN mkdir -p data

EXPOSE 4820

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
