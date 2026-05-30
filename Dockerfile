FROM node:22-slim

RUN apt-get update && apt-get install -y tmux python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY client/package*.json ./client/
COPY client/scripts ./client/scripts
RUN npm ci --prefix client

COPY mcp/package*.json ./mcp/
RUN npm ci --prefix mcp

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["node", "server/index.js"]
