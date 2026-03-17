# syntax=docker/dockerfile:1.7

# Build context must be the repository root so the local file dependency
# ("agent-dashboard": "file:..") resolves correctly.

FROM node:22-alpine AS deps
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY mcp/package.json mcp/package-lock.json ./mcp/

RUN npm --prefix mcp ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY mcp/package.json mcp/package-lock.json ./mcp/

RUN npm --prefix mcp ci

COPY mcp ./mcp

RUN npm --prefix mcp run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /workspace/mcp/node_modules ./node_modules
COPY --from=build /workspace/mcp/build ./build
COPY --from=build /workspace/mcp/package.json ./package.json

ENTRYPOINT ["node", "build/index.js"]
