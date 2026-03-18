import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ApiError } from "../clients/dashboard-api-client.js";

export function jsonResult(title: string, payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `${title}\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  };
}

export function errorResult(error: unknown): CallToolResult {
  if (error instanceof ApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error.message,
              code: error.code ?? null,
              status: error.status ?? null,
              details: error.details ?? null,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: message,
            code: "INTERNAL_ERROR",
          },
          null,
          2
        ),
      },
    ],
  };
}
