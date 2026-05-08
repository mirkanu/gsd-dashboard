import { z } from "zod";
import type { ToolContext } from "../../types/tool-context.js";
import { createToolRegistrar } from "../../core/tool-registry.js";

const VALID_FILE_IDS = ["project", "state", "roadmap", "requirements"] as const;
type PlanningFileId = (typeof VALID_FILE_IDS)[number];

export function registerGsdTools(context: ToolContext): void {
  const { api, logger, server } = context;
  const register = createToolRegistrar(server, logger);

  register(
    "gsd_list_projects",
    "List all GSD projects tracked by the dashboard. Returns project names that can be used with gsd_read_planning_file.",
    {},
    async () => {
      const config = await api.get<{
        projects: Array<{ name: string; display_name?: string; archived?: boolean }>;
      }>("/api/gsd/config");
      return {
        projects: config.projects.map((p) => ({
          name: p.name,
          display_name: p.display_name ?? p.name,
          archived: p.archived ?? false,
        })),
      };
    }
  );

  register(
    "gsd_get_all_project_status",
    [
      "Get the live status of all GSD projects in one call.",
      "Returns each project's session state (working/waiting/paused/archived),",
      "tmux status text, live URL, version, and whether tmux is active.",
      "More efficient than reading individual planning files when you want an overview.",
    ].join(" "),
    {},
    async () => {
      const { projects } = await api.get<{
        projects: Array<{
          name: string;
          display_name?: string;
          tmuxActive: boolean;
          sessionState: string;
          version?: string;
          statusText?: string;
          liveUrl?: string;
          archived?: boolean;
        }>;
        rateLimit?: unknown;
      }>("/api/gsd/projects");
      return {
        projects: projects.map((p) => ({
          name: p.name,
          display_name: p.display_name ?? p.name,
          session_state: p.sessionState,
          status_text: p.statusText ?? null,
          tmux_active: p.tmuxActive,
          version: p.version ?? null,
          live_url: p.liveUrl ?? null,
          archived: p.archived ?? false,
        })),
      };
    }
  );

  register(
    "gsd_list_tasks",
    [
      "List tasks for a GSD project.",
      "Use gsd_list_projects first to discover available project names.",
      "Returns task id, title, description, and archived status.",
      "Set include_archived to true to also return archived tasks.",
    ].join(" "),
    {
      project_name: z
        .string()
        .min(1)
        .max(128)
        .describe("Project name from gsd_list_projects"),
      include_archived: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include archived tasks (default: false)"),
    },
    async (args) => {
      const projectName = args.project_name as string;
      const includeArchived = args.include_archived as boolean;
      const qs = includeArchived ? "?archived=true" : "";
      const tasks = await api.get<
        Array<{
          id: number;
          title: string;
          description?: string;
          archived?: boolean;
          created_at?: string;
        }>
      >(
        `/api/gsd/projects/${encodeURIComponent(projectName)}/tasks${qs}`
      );
      return { project: projectName, tasks };
    }
  );

  register(
    "gsd_read_planning_file",
    [
      "Read a GSD planning file for a tracked project.",
      "Use gsd_list_projects first to discover available project names.",
      `Valid file_id values: ${VALID_FILE_IDS.join(", ")}.`,
      "- project: .planning/PROJECT.md — project overview, stack, live URL",
      "- state: .planning/STATE.md — current phase, blockers, last activity",
      "- roadmap: .planning/ROADMAP.md — phase list, goals, success criteria",
      "- requirements: .planning/REQUIREMENTS.md — requirement IDs and completion status",
    ].join(" "),
    {
      project_name: z
        .string()
        .min(1)
        .max(128)
        .describe("Project name from gsd_list_projects"),
      file_id: z
        .enum(VALID_FILE_IDS)
        .describe(
          "Which planning file to read: project | state | roadmap | requirements"
        ),
    },
    async (args) => {
      const projectName = args.project_name as string;
      const fileId = args.file_id as PlanningFileId;
      const content = await api.get<string>(
        `/api/gsd/projects/${encodeURIComponent(projectName)}/files/${encodeURIComponent(fileId)}`
      );
      return { project: projectName, file_id: fileId, content };
    }
  );
}
