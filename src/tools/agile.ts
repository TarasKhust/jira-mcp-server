import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig } from '../config.js';
import { createJiraApiClient } from '../clients.js';

export function registerAgileTools(server: McpServer): void {
  server.tool(
    "get_agile_boards",
    "Get all Agile boards for a project",
    {
      projectKey: z.string().optional().describe("Optional project key to filter boards"),
    },
    async ({ projectKey }: { projectKey?: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        const params: any = {};
        if (projectKey) {
          params.projectKeyOrId = projectKey;
        }
        const response = await jiraApiClient.get('/board', { params });

        if (!response.data.values || response.data.values.length === 0) {
          return {
            content: [{ type: "text", text: `No boards found${projectKey ? ` for project ${projectKey}` : ''}` }],
          };
        }

        const formattedBoards = response.data.values.map((board: any) => {
          return `${board.id}: ${board.name} (${board.type})`;
        }).join('\n');

        return {
          content: [{ type: "text", text: formattedBoards }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get boards: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_board_issues",
    "Get issues from an Agile board",
    {
      boardId: z.number().describe("The board ID"),
      jql: z.string().optional().describe("Optional JQL query to filter issues"),
    },
    async ({ boardId, jql }: { boardId: number; jql?: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        const params: any = {};
        if (jql) {
          params.jql = jql;
        }
        const response = await jiraApiClient.get(`/board/${boardId}/issue`, { params });

        if (!response.data.issues || response.data.issues.length === 0) {
          return {
            content: [{ type: "text", text: `No issues found for board ${boardId}` }],
          };
        }

        const formattedIssues = response.data.issues.map((issue: any) => {
          const summary = issue.fields?.summary || 'No summary';
          const status = issue.fields?.status?.name || 'Unknown status';
          return `${issue.key}: ${summary} (${status})`;
        }).join('\n');

        return {
          content: [{ type: "text", text: formattedIssues }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get board issues: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_sprints_from_board",
    "Get all sprints from an Agile board",
    {
      boardId: z.number().describe("The board ID"),
      state: z.string().optional().describe("Filter by sprint state (active, future, closed)"),
    },
    async ({ boardId, state }: { boardId: number; state?: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        const params: any = {};
        if (state) {
          params.state = state;
        }
        const response = await jiraApiClient.get(`/board/${boardId}/sprint`, { params });

        if (!response.data.values || response.data.values.length === 0) {
          return {
            content: [{ type: "text", text: `No sprints found for board ${boardId}` }],
          };
        }

        const formattedSprints = response.data.values.map((sprint: any) => {
          const startDate = sprint.startDate ? new Date(sprint.startDate).toLocaleDateString() : 'Not started';
          const endDate = sprint.endDate ? new Date(sprint.endDate).toLocaleDateString() : 'Not ended';
          return `${sprint.id}: ${sprint.name} (${sprint.state}) - ${startDate} to ${endDate}`;
        }).join('\n');

        return {
          content: [{ type: "text", text: formattedSprints }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get sprints: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_sprint_issues",
    "Get issues from a sprint",
    {
      sprintId: z.number().describe("The sprint ID"),
    },
    async ({ sprintId }: { sprintId: number }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        const response = await jiraApiClient.get(`/sprint/${sprintId}/issue`);

        if (!response.data.issues || response.data.issues.length === 0) {
          return {
            content: [{ type: "text", text: `No issues found for sprint ${sprintId}` }],
          };
        }

        const formattedIssues = response.data.issues.map((issue: any) => {
          const summary = issue.fields?.summary || 'No summary';
          const status = issue.fields?.status?.name || 'Unknown status';
          return `${issue.key}: ${summary} (${status})`;
        }).join('\n');

        return {
          content: [{ type: "text", text: formattedIssues }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get sprint issues: ${errorMessage}` }],
        };
      }
    }
  );
}
