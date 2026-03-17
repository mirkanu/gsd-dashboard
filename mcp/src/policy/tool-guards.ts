import type { AppConfig } from "../config/app-config.js";

export function assertMutationsEnabled(config: AppConfig): void {
  if (!config.allowMutations) {
    throw new Error(
      "Mutating tools are disabled. Set MCP_DASHBOARD_ALLOW_MUTATIONS=true to enable them."
    );
  }
}

export function assertDestructiveEnabled(config: AppConfig, confirmationToken: string): void {
  assertMutationsEnabled(config);
  if (!config.allowDestructive) {
    throw new Error(
      "Destructive tools are disabled. Set MCP_DASHBOARD_ALLOW_DESTRUCTIVE=true to enable them."
    );
  }
  if (confirmationToken !== "CLEAR_ALL_DATA") {
    throw new Error('Invalid confirmation_token. Expected exact value: "CLEAR_ALL_DATA".');
  }
}
