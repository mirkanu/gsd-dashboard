import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DashboardApiClient } from "./clients/dashboard-api-client.js";
import { loadConfig } from "./config/app-config.js";
import { Logger } from "./core/logger.js";
import { buildServer } from "./server.js";

async function main() {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const api = new DashboardApiClient(config, logger);
  const server = buildServer(config, api, logger);
  const transport = new StdioServerTransport();

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error: error.message });
    process.exitCode = 1;
  });

  await server.connect(transport);

  logger.info("Agent Dashboard MCP server started", {
    serverName: config.serverName,
    serverVersion: config.serverVersion,
    dashboardBaseUrl: config.dashboardBaseUrl.toString(),
    allowMutations: config.allowMutations,
    allowDestructive: config.allowDestructive,
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        level: "error",
        message: "Fatal startup error",
        meta: { error: message },
      },
      null,
      2
    )}\n`
  );
  process.exit(1);
});
