import { z } from "zod";

export const SessionStatusSchema = z.enum(["active", "completed", "error", "abandoned"]);
export const AgentStatusSchema = z.enum(["idle", "connected", "working", "completed", "error"]);
export const HookTypeSchema = z.enum([
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SubagentStop",
  "Notification",
  "SessionStart",
  "SessionEnd",
]);

export const JsonObjectSchema = z.record(z.unknown());
