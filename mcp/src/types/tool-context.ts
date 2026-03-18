import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/app-config.js";
import type { DashboardApiClient } from "../clients/dashboard-api-client.js";
import type { Logger } from "../core/logger.js";

export interface ToolContext {
  server: McpServer;
  config: AppConfig;
  api: DashboardApiClient;
  logger: Logger;
}
