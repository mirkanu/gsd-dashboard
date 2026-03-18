import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config/app-config.js";
import { DashboardApiClient } from "./clients/dashboard-api-client.js";
import { Logger } from "./core/logger.js";
import { registerAllTools } from "./tools/index.js";

export function buildServer(config: AppConfig, api: DashboardApiClient, logger: Logger): McpServer {
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });

  registerAllTools({
    server,
    config,
    api,
    logger,
  });

  return server;
}
