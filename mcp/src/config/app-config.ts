export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  serverName: string;
  serverVersion: string;
  dashboardBaseUrl: URL;
  requestTimeoutMs: number;
  retryCount: number;
  retryBackoffMs: number;
  allowMutations: boolean;
  allowDestructive: boolean;
  logLevel: LogLevel;
}

const LOCAL_DASHBOARD_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "host.docker.internal",
  "gateway.docker.internal",
  "host.containers.internal",
]);
const VALID_LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase() as LogLevel | undefined;
  return normalized && VALID_LOG_LEVELS.has(normalized) ? normalized : "info";
}

function parseDashboardUrl(raw: string | undefined): URL {
  const value = (raw ?? "http://127.0.0.1:4820").trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid MCP_DASHBOARD_BASE_URL: "${value}"`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `MCP_DASHBOARD_BASE_URL must use http or https, received protocol "${url.protocol}"`
    );
  }

  if (!LOCAL_DASHBOARD_HOSTS.has(url.hostname)) {
    throw new Error(
      `MCP_DASHBOARD_BASE_URL must target a local dashboard host (${Array.from(LOCAL_DASHBOARD_HOSTS).join(", ")}). Received hostname "${url.hostname}".`
    );
  }

  return url;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    serverName: env.MCP_SERVER_NAME?.trim() || "agent-dashboard-mcp",
    serverVersion: env.MCP_SERVER_VERSION?.trim() || "1.0.0",
    dashboardBaseUrl: parseDashboardUrl(env.MCP_DASHBOARD_BASE_URL),
    requestTimeoutMs: parseInteger(env.MCP_DASHBOARD_TIMEOUT_MS, 10_000, 500, 120_000),
    retryCount: parseInteger(env.MCP_DASHBOARD_RETRY_COUNT, 2, 0, 5),
    retryBackoffMs: parseInteger(env.MCP_DASHBOARD_RETRY_BACKOFF_MS, 250, 50, 10_000),
    allowMutations: parseBoolean(env.MCP_DASHBOARD_ALLOW_MUTATIONS, false),
    allowDestructive: parseBoolean(env.MCP_DASHBOARD_ALLOW_DESTRUCTIVE, false),
    logLevel: parseLogLevel(env.MCP_LOG_LEVEL),
  };
}
