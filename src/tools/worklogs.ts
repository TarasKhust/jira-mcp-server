import axios from 'axios';
import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig } from '../config.js';
import { createJiraApiClient } from '../clients.js';

export function registerWorklogTools(server: McpServer): void {
  server.tool(
    "add_worklog",
    "Add worklog (time spent) to a Jira ticket",
    {
      ticketId: z.string().describe("The Jira ticket ID (e.g., PROJECT-123)"),
      timeSpent: z.string().describe("Time spent in JIRA format (e.g., '1h', '30m', '1h 30m', '2d 4h 30m')"),
      comment: z.string().optional().describe("Optional comment for the worklog"),
    },
    async ({ ticketId, timeSpent, comment }: { ticketId: string; timeSpent: string; comment?: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        // Use API v2 for worklogs (works on both Cloud and Server)
        const jiraApiClient = axios.create({
          baseURL: `${process.env.JIRA_HOST}/rest/api/2`,
          auth: {
            username: process.env.JIRA_EMAIL!,
            password: process.env.JIRA_API_TOKEN!,
          },
          headers: { 'Content-Type': 'application/json' },
        });

        const worklogData: any = { timeSpent };
        if (comment) {
          worklogData.comment = comment;
        }

        await jiraApiClient.post(`/issue/${ticketId}/worklog`, worklogData);

        return {
          content: [{ type: "text", text: `Successfully logged ${timeSpent} to ticket ${ticketId}${comment ? ` with comment: ${comment}` : ''}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.response?.data?.message || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to add worklog: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_worklog",
    "Get worklogs for a specific Jira ticket",
    {
      ticketId: z.string().describe("The Jira ticket ID (e.g., PROJECT-123)"),
    },
    async ({ ticketId }: { ticketId: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        const worklogs = await jiraApiClient.get(`/issue/${ticketId}/worklog`);

        if (!worklogs.data.worklogs || worklogs.data.worklogs.length === 0) {
          return {
            content: [{ type: "text", text: `No worklogs found for ticket ${ticketId}` }],
          };
        }

        const formattedWorklogs = worklogs.data.worklogs.map((worklog: any) => {
          const author = worklog.author?.displayName || 'Unknown';
          const timeSpent = worklog.timeSpent || 'Unknown';
          const started = worklog.started ? new Date(worklog.started).toLocaleString() : 'Unknown';
          const comment = worklog.comment || 'No comment';
          const id = worklog.id || 'Unknown';
          return `[${started}] ${author}: ${timeSpent} (id: ${id})\n${comment}\n---`;
        }).join('\n\n');

        return {
          content: [{ type: "text", text: formattedWorklogs }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get worklogs: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "update_worklog",
    "Update an existing worklog on a Jira ticket",
    {
      ticketId: z.string().describe("The Jira ticket ID (e.g., PROJECT-123)"),
      worklogId: z.string().describe("The worklog ID to update"),
      timeSpent: z.string().optional().describe("New time spent in JIRA format (e.g., '1h', '30m', '1h 30m')"),
      comment: z.string().optional().describe("New comment for the worklog"),
    },
    async ({ ticketId, worklogId, timeSpent, comment }: { ticketId: string; worklogId: string; timeSpent?: string; comment?: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        const updateData: any = {};
        if (timeSpent) updateData.timeSpent = timeSpent;
        if (comment) updateData.comment = comment;

        await jiraApiClient.put(`/issue/${ticketId}/worklog/${worklogId}`, updateData);

        return {
          content: [{ type: "text", text: `Successfully updated worklog ${worklogId} on ticket ${ticketId}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to update worklog: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "delete_worklog",
    "Delete a worklog from a Jira ticket",
    {
      ticketId: z.string().describe("The Jira ticket ID (e.g., PROJECT-123)"),
      worklogId: z.string().describe("The worklog ID to delete (use get_worklog to find IDs)"),
    },
    async ({ ticketId, worklogId }: { ticketId: string; worklogId: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        await jiraApiClient.delete(`/issue/${ticketId}/worklog/${worklogId}`);

        return {
          content: [{ type: "text", text: `Successfully deleted worklog ${worklogId} from ticket ${ticketId}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to delete worklog: ${errorMessage}` }],
        };
      }
    }
  );
}
