import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig } from '../config.js';
import { createJiraApiClient } from '../clients.js';

export function registerIssueLinkTools(server: McpServer): void {
  server.tool(
    "create_issue_link",
    "Create a link between two Jira issues",
    {
      inwardIssue: z.string().describe("The inward issue key (e.g., PROJECT-123)"),
      outwardIssue: z.string().describe("The outward issue key (e.g., PROJECT-456)"),
      linkType: z.string().describe("The link type (e.g., 'Relates', 'Blocks', 'Clones')"),
    },
    async ({ inwardIssue, outwardIssue, linkType }: { inwardIssue: string; outwardIssue: string; linkType: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        await jiraApiClient.post('/issueLink', {
          type: { name: linkType },
          inwardIssue: { key: inwardIssue },
          outwardIssue: { key: outwardIssue },
        });

        return {
          content: [{ type: "text", text: `Successfully linked ${outwardIssue} ${linkType} ${inwardIssue}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to create issue link: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "remove_issue_link",
    "Remove a link between two Jira issues",
    {
      linkId: z.string().describe("The link ID to remove"),
    },
    async ({ linkId }: { linkId: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        await jiraApiClient.delete(`/issueLink/${linkId}`);

        return {
          content: [{ type: "text", text: `Successfully removed issue link ${linkId}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to remove issue link: ${errorMessage}` }],
        };
      }
    }
  );
}
