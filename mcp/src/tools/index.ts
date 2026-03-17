import type { ToolContext } from "../types/tool-context.js";
import { registerObservabilityTools } from "./domains/observability-tools.js";
import { registerSessionTools } from "./domains/session-tools.js";
import { registerAgentTools } from "./domains/agent-tools.js";
import { registerEventTools } from "./domains/event-tools.js";
import { registerPricingTools } from "./domains/pricing-tools.js";
import { registerMaintenanceTools } from "./domains/maintenance-tools.js";

export function registerAllTools(context: ToolContext): void {
  registerObservabilityTools(context);
  registerSessionTools(context);
  registerAgentTools(context);
  registerEventTools(context);
  registerPricingTools(context);
  registerMaintenanceTools(context);
}
