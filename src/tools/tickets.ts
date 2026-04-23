import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig, isCloud } from '../config.js';
import { jira, createJiraApiClient } from '../clients.js';
import { extractTextFromADF } from '../utils/adf.js';
import { validateAndFormatProjectKeys, escapeJQLText } from '../utils/jql.js';
import type { JiraTicket } from '../types.js';
import { TicketSchema } from '../types.js';

export function registerTicketTools(server: McpServer): void {
  server.tool(
    "list_tickets",
    "List Jira tickets assigned to you",
    {
      jql: z.string().optional().describe("Optional JQL query to filter tickets"),
    },
    async ({ jql }: { jql?: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const query = jql || 'assignee = currentUser() ORDER BY updated DESC';
        let tickets: any;

        const jiraApiClient = createJiraApiClient();

        const response = await jiraApiClient.post('/search/jql', {
          jql: query,
          maxResults: 100,
          fields: ['summary', 'status', 'issuetype', 'priority', 'assignee'],
        });
        tickets = {
          issues: response.data.issues || response.data.values || [],
          total: response.data.total || 0,
        };

        if (!tickets.issues || tickets.issues.length === 0) {
          return {
            content: [{ type: "text", text: "No tickets found" }],
          };
        }

        const formattedTickets = tickets.issues.map((issue: any) => {
          const summary = issue.fields?.summary || 'No summary';
          const status = issue.fields?.status?.name || 'Unknown status';
          return `${issue.key}: ${summary} (${status})`;
        }).join('\n');

        return {
          content: [{ type: "text", text: formattedTickets }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to fetch tickets: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_ticket",
    "Get details of a specific Jira ticket",
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
        let ticket: any;
        try {
          ticket = await jira.issues.getIssue({
            issueIdOrKey: ticketId,
            fields: ['summary', 'status', 'issuetype', 'description', 'parent', 'issuelinks'],
          });
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const response = await jiraApiClient.get(`/issue/${ticketId}`);
            ticket = response.data;
          } else {
            throw jiraJsError;
          }
        }

        const formattedTicket = [
          `Key: ${ticket.key}`,
          `Summary: ${ticket.fields?.summary || 'No summary'}`,
          `Status: ${ticket.fields?.status?.name || 'Unknown status'}`,
          `Type: ${ticket.fields?.issuetype?.name || 'Unknown type'}`,
          `Description:\n${extractTextFromADF(ticket.fields?.description) || 'No description'}`,
          `Parent: ${ticket.fields?.parent?.key || 'No parent'}`
        ];

        const links = ticket.fields?.issuelinks || [];
        if (Array.isArray(links) && links.length > 0) {
          formattedTicket.push('\nLinked Issues:');
          for (const link of links) {
            if (link.outwardIssue) {
              const key = link.outwardIssue.key;
              const summary = link.outwardIssue.fields?.summary || 'No summary';
              const type = link.type?.outward || link.type?.name || 'Related';
              formattedTicket.push(`- [${type}] ${key}: ${summary}`);
            }
            if (link.inwardIssue) {
              const key = link.inwardIssue.key;
              const summary = link.inwardIssue.fields?.summary || 'No summary';
              const type = link.type?.inward || link.type?.name || 'Related';
              formattedTicket.push(`- [${type}] ${key}: ${summary}`);
            }
          }
        } else {
          formattedTicket.push('\nLinked Issues: None');
        }

        return {
          content: [{ type: "text", text: formattedTicket.join('\n') }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to fetch ticket: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "create_ticket",
    "Create a new Jira ticket",
    {
      ticket: TicketSchema,
    },
    async ({ ticket }: { ticket: JiraTicket }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const fields: any = {
          project: { key: ticket.projectKey },
          summary: ticket.summary,
          description: ticket.description,
          issuetype: { name: ticket.issueType },
        };

        if (ticket.parent) {
          fields.parent = { key: ticket.parent };
        }

        if (ticket.customFields) {
          Object.assign(fields, ticket.customFields);
        }

        let newTicket: any;

        if (!isCloud()) {
          const jiraApiClient = createJiraApiClient();
          const response = await jiraApiClient.post('/issue', { fields });
          newTicket = response.data;
        } else {
          try {
            newTicket = await jira.issues.createIssue({
              fields: fields,
            });
          } catch (jiraJsError: any) {
            if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
              const jiraApiClient = createJiraApiClient();
              const response = await jiraApiClient.post('/issue', { fields });
              newTicket = response.data;
            } else {
              throw jiraJsError;
            }
          }
        }

        return {
          content: [{ type: "text", text: `Created ticket: ${newTicket.key}` }],
        };
      } catch (error: any) {
        const errorMessages = error.response?.data?.errorMessages?.join(', ') || '';
        const fieldErrors = error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : '';
        const errorMessage = [errorMessages, fieldErrors].filter(Boolean).join(' | ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to create ticket: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "search_tickets",
    "Search for tickets in specific projects using text search",
    {
      searchText: z.string().describe("The text to search for in tickets"),
      projectKeys: z.string().describe("Comma-separated list of project keys"),
      maxResults: z.number().optional().describe("Maximum number of results to return"),
    },
    async ({ searchText, projectKeys, maxResults = 50 }: { searchText: string; projectKeys: string; maxResults?: number }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const projects = validateAndFormatProjectKeys(projectKeys);
        if (projects.length === 0) {
          return {
            content: [{ type: "text", text: "No valid project keys provided. Please provide at least one project key." }],
          };
        }

        const escapedText = escapeJQLText(searchText);
        const jql = `text ~ "${escapedText}" AND project IN (${projects.join(',')}) ORDER BY updated DESC`;

        let searchResults: any;

        try {
          searchResults = await jira.issueSearch.searchForIssuesUsingJql({
            jql,
            maxResults,
            fields: ['summary', 'status', 'updated', 'project', 'description'],
          });
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const response = await jiraApiClient.get('/search', {
              params: {
                jql,
                maxResults,
                fields: 'summary,status,updated,project,description',
              },
            });
            searchResults = response.data;
          } else {
            throw jiraJsError;
          }
        }

        if (!searchResults.issues || searchResults.issues.length === 0) {
          return {
            content: [{ type: "text", text: `No tickets found matching "${searchText}" in projects: ${projects.join(', ')}` }],
          };
        }

        const formattedResults = searchResults.issues.map((issue: any) => {
          const summary = issue.fields?.summary || 'No summary';
          const status = issue.fields?.status?.name || 'Unknown status';
          const project = issue.fields?.project?.key || 'Unknown project';
          const updated = issue.fields?.updated ?
            new Date(issue.fields.updated).toLocaleString() :
            'Unknown date';
          const description = issue.fields?.description ?
            extractTextFromADF(issue.fields.description) :
            'No description';

          return `[${project}] ${issue.key}: ${summary}
Status: ${status} (Updated: ${updated})
Description:
${description.trim()}
----------------------------------------\n`;
        }).join('\n');

        const totalResults = searchResults.total || 0;
        const headerText = `Found ${totalResults} ticket${totalResults !== 1 ? 's' : ''} matching "${searchText}"\n\n`;

        return {
          content: [{ type: "text", text: headerText + formattedResults }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error occurred';
        return {
          content: [{ type: "text", text: `Failed to search tickets: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "delete_issue",
    "Delete a Jira ticket",
    {
      ticketId: z.string().describe("The Jira ticket ID (e.g., PROJECT-123)"),
      deleteSubtasks: z.boolean().optional().describe("Whether to delete subtasks"),
    },
    async ({ ticketId, deleteSubtasks = false }: { ticketId: string; deleteSubtasks?: boolean }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        try {
          await jira.issues.deleteIssue({
            issueIdOrKey: ticketId,
            deleteSubtasks,
          });
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const params: any = {};
            if (deleteSubtasks) {
              params.deleteSubtasks = 'true';
            }
            await jiraApiClient.delete(`/issue/${ticketId}`, { params });
          } else {
            throw jiraJsError;
          }
        }

        return {
          content: [{ type: "text", text: `Successfully deleted ticket ${ticketId}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to delete ticket: ${errorMessage}` }],
        };
      }
    }
  );
}
