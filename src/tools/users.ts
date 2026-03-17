import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig, isCloud } from '../config.js';
import { jira, createJiraApiClient } from '../clients.js';

export function registerUserTools(server: McpServer): void {
  server.tool(
    "search_users",
    "Search for Jira users by email or display name to get their accountId for mentions",
    {
      query: z.string().describe("Email address or display name to search for"),
      maxResults: z.number().optional().describe("Maximum number of results to return (default: 10)"),
    },
    async ({ query, maxResults = 10 }: { query: string; maxResults?: number }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        let users: any[] = [];

        if (isCloud()) {
          try {
            const response = await jiraApiClient.get('/user/search', {
              params: { query, maxResults },
            });
            users = response.data || [];
          } catch (searchError: any) {
            try {
              const usersFromJiraJs = await jira.userSearch.findUsers({
                query, maxResults,
              });
              users = usersFromJiraJs || [];
            } catch (jiraJsError: any) {
              throw searchError;
            }
          }
        } else {
          try {
            const response = await jiraApiClient.get('/user/search', {
              params: { username: query, maxResults },
            });
            users = response.data || [];
          } catch (serverError: any) {
            const response = await jiraApiClient.get('/user/picker', {
              params: { query, maxResults },
            });
            users = response.data?.users || [];
          }
        }

        if (users.length === 0) {
          return {
            content: [{ type: "text", text: `No users found matching "${query}"` }],
          };
        }

        const formattedUsers = users.map((user: any) => {
          const accountId = user.accountId || user.key || user.name || 'N/A';
          const displayName = user.displayName || user.name || 'Unknown';
          const email = user.emailAddress || 'Not available';
          const active = user.active !== undefined ? (user.active ? 'Active' : 'Inactive') : 'N/A';
          return `Account ID: ${accountId}\nDisplay Name: ${displayName}\nEmail: ${email}\nStatus: ${active}\nMention format: [~${accountId}]\n---`;
        }).join('\n\n');

        return {
          content: [{ type: "text", text: `Found ${users.length} user(s):\n\n${formattedUsers}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.response?.data?.message || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to search users: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_user_profile",
    "Get user profile information",
    {
      accountId: z.string().optional().describe("User account ID (optional, defaults to current user)"),
    },
    async ({ accountId }: { accountId?: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        let user: any;

        try {
          user = accountId
            ? await jira.users.getUser({ accountId })
            : await jira.myself.getCurrentUser();
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const endpoint = accountId ? `/user?accountId=${accountId}` : '/myself';
            const response = await jiraApiClient.get(endpoint);
            user = response.data;
          } else {
            throw jiraJsError;
          }
        }

        const profile = [
          `Account ID: ${user.accountId || user.key || 'N/A'}`,
          `Display Name: ${user.displayName || user.name || 'N/A'}`,
          `Email: ${user.emailAddress || 'Not available'}`,
          `Active: ${user.active !== undefined ? user.active : 'N/A'}`,
        ].join('\n');

        return {
          content: [{ type: "text", text: profile }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get user profile: ${errorMessage}` }],
        };
      }
    }
  );
}
