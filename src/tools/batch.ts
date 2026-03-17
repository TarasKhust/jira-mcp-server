import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig } from '../config.js';
import { jira, createJiraApiClient } from '../clients.js';
import type { JiraTicket } from '../types.js';
import { TicketSchema } from '../types.js';
import { z } from 'zod';

export function registerBatchTools(server: McpServer): void {
  server.tool(
    "batch_create_issues",
    "Create multiple Jira issues in a batch",
    {
      issues: z.array(TicketSchema).describe("Array of issues to create"),
    },
    async ({ issues }: { issues: JiraTicket[] }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const issueUpdates = issues.map((ticket) => {
          const fields: any = {
            project: { key: ticket.projectKey },
            summary: ticket.summary,
            description: ticket.description,
            issuetype: { name: ticket.issueType },
          };

          if (ticket.parent) {
            fields.parent = { key: ticket.parent };
          }

          return { fields };
        });

        let results: any;

        try {
          results = await jira.issues.createIssues({ issueUpdates });
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const createdIssues: any[] = [];
            const errors: any[] = [];

            for (const issueUpdate of issueUpdates) {
              try {
                const response = await jiraApiClient.post('/issue', issueUpdate);
                createdIssues.push(response.data);
              } catch (error: any) {
                errors.push({
                  elementErrors: [{ message: error.response?.data?.errorMessages?.join(', ') || error.message }],
                });
              }
            }

            results = { issues: createdIssues, errors };
          } else {
            throw jiraJsError;
          }
        }

        if (results.errors && results.errors.length > 0) {
          const errorMessages = results.errors.map((error: any) => {
            return `Failed to create issue: ${error.elementErrors?.map((e: any) => e.message).join(', ') || 'Unknown error'}`;
          }).join('\n');

          const successCount = results.issues?.length || 0;
          const createdKeys = results.issues?.map((issue: any) => issue.key).join(', ') || 'None';

          return {
            content: [{ type: "text", text: `Batch create completed with errors:\n\nCreated (${successCount}): ${createdKeys}\n\nErrors:\n${errorMessages}` }],
          };
        }

        const createdKeys = results.issues?.map((issue: any) => issue.key).join(', ') || 'None';
        return {
          content: [{ type: "text", text: `Successfully created ${results.issues?.length || 0} issues: ${createdKeys}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to batch create issues: ${errorMessage}` }],
        };
      }
    }
  );
}
