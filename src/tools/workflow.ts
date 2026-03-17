import * as https from 'https';
import { URL } from 'url';
import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig, isCloud } from '../config.js';
import { jira, createJiraApiClient } from '../clients.js';
import type { StatusUpdate } from '../types.js';
import { StatusUpdateSchema } from '../types.js';

export function registerWorkflowTools(server: McpServer): void {
  server.tool(
    "update_status",
    "Update the status of a Jira ticket",
    {
      ticketId: z.string().describe("The Jira ticket ID"),
      status: StatusUpdateSchema,
    },
    async ({ ticketId, status }: { ticketId: string; status: StatusUpdate }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        try {
          await jira.issues.doTransition({
            issueIdOrKey: ticketId,
            transition: { id: status.transitionId },
          });
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            await jiraApiClient.post(`/issue/${ticketId}/transitions`, {
              transition: { id: status.transitionId },
            });
          } else {
            throw jiraJsError;
          }
        }

        return {
          content: [{ type: "text", text: `Updated status of ${ticketId}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to update status: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_transitions",
    "Get available transitions for a Jira ticket",
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
        let transitions: any;

        try {
          transitions = await jira.issues.getTransitions({
            issueIdOrKey: ticketId,
          });
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const response = await jiraApiClient.get(`/issue/${ticketId}/transitions`);
            transitions = response.data;
          } else {
            throw jiraJsError;
          }
        }

        const transitionsList = transitions.transitions || [];
        if (transitionsList.length === 0) {
          return {
            content: [{ type: "text", text: `No transitions available for ticket ${ticketId}` }],
          };
        }

        const formattedTransitions = transitionsList.map((transition: any) => {
          return `${transition.id}: ${transition.name}${transition.to ? ` -> ${transition.to.name}` : ''}`;
        }).join('\n');

        return {
          content: [{ type: "text", text: formattedTransitions }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get transitions: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "assign_ticket",
    "Assign a Jira ticket to a user",
    {
      ticketId: z.string().describe("The Jira ticket ID (e.g., PROJECT-123)"),
      assignee: z.string().describe("The email, accountId, or username of the user to assign the ticket to. Use '-1' to assign to default assignee, 'null' to unassign"),
    },
    async ({ ticketId, assignee }: { ticketId: string; assignee: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();

        if (assignee === '-1') {
          if (isCloud()) {
            await jiraApiClient.put(`/issue/${ticketId}/assignee`, { accountId: '-1' });
          } else {
            await jiraApiClient.put(`/issue/${ticketId}/assignee`, { name: '-1' });
          }
        } else if (assignee === 'null' || assignee === '') {
          if (isCloud()) {
            await jiraApiClient.put(`/issue/${ticketId}/assignee`, { accountId: null });
          } else {
            await jiraApiClient.put(`/issue/${ticketId}/assignee`, { name: null });
          }
        } else {
          if (isCloud()) {
            let accountId = assignee;

            if (!assignee.match(/^[a-zA-Z0-9]{24,}$/)) {
              try {
                const users = await jira.userSearch.findUsers({
                  query: assignee,
                  maxResults: 1,
                });

                if (users && users.length > 0 && users[0].accountId) {
                  accountId = users[0].accountId;
                } else {
                  try {
                    const response = await jiraApiClient.get('/user/search', {
                      params: { query: assignee, maxResults: 1 },
                    });
                    if (response.data && response.data.length > 0 && response.data[0].accountId) {
                      accountId = response.data[0].accountId;
                    }
                  } catch (searchError: any) {
                    // If search fails, assume assignee is already accountId
                  }
                }
              } catch (userSearchError: any) {
                // If user search fails, assume assignee is already accountId
              }
            }

            // Use direct HTTPS request for GDPR strict mode compliance
            const assignUrl = new URL(`${process.env.JIRA_HOST}/rest/api/3/issue/${ticketId}/assignee`);
            const requestBody = JSON.stringify({ accountId: accountId });
            const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');

            await new Promise<void>((resolve, reject) => {
              const options = {
                hostname: assignUrl.hostname,
                port: 443,
                path: assignUrl.pathname,
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(requestBody),
                  'Authorization': `Basic ${auth}`,
                },
              };

              const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                  if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                  } else {
                    try {
                      const errorData = JSON.parse(data);
                      reject(new Error(errorData.message || errorData.errorMessages?.join(', ') || `HTTP ${res.statusCode}`));
                    } catch {
                      reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                  }
                });
              });

              req.on('error', (error) => { reject(error); });
              req.write(requestBody);
              req.end();
            });
          } else {
            const username = assignee.includes('@') ? assignee.split('@')[0] : assignee;

            try {
              await jiraApiClient.put(`/issue/${ticketId}/assignee`, { name: username });
            } catch (usernameError: any) {
              if (assignee.includes('@')) {
                await jiraApiClient.put(`/issue/${ticketId}/assignee`, { name: assignee });
              } else {
                throw usernameError;
              }
            }
          }
        }

        const assigneeText = assignee === '-1' ? 'default assignee' : assignee === 'null' || assignee === '' ? 'unassigned' : assignee;
        return {
          content: [{ type: "text", text: `Successfully assigned ticket ${ticketId} to ${assigneeText}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.response?.data?.message || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to assign ticket: ${errorMessage}` }],
        };
      }
    }
  );
}
