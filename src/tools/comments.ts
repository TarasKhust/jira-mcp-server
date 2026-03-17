import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig, isCloud } from '../config.js';
import { jira, createJiraApiClient } from '../clients.js';
import { extractTextFromADF, convertTextToADFWithMentions } from '../utils/adf.js';
import type { JiraComment } from '../types.js';
import { CommentSchema } from '../types.js';

export function registerCommentTools(server: McpServer): void {
  server.tool(
    "get_comments",
    "Get comments for a specific Jira ticket",
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
        let commentsResult: any;

        try {
          commentsResult = await jira.issueComments.getComments({ issueIdOrKey: ticketId });
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const response = await jiraApiClient.get(`/issue/${ticketId}/comment`);
            commentsResult = response.data;
          } else {
            throw jiraJsError;
          }
        }

        const comments = commentsResult.comments || [];
        if (comments.length === 0) {
          return {
            content: [{ type: "text", text: "No comments found for this ticket." }],
          };
        }

        const formattedComments = comments.map((comment: any) => {
          const commentId = comment.id || 'Unknown ID';
          const author = comment.author?.displayName || comment.author?.name || 'Unknown Author';
          const body = extractTextFromADF(comment.body) || comment.body || 'No comment body';
          const createdDate = comment.created ? new Date(comment.created).toLocaleString() : 'Unknown date';
          return `[ID: ${commentId}] [${createdDate}] ${author}:\n${body.trim()}\n---`;
        }).join('\n\n');

        return {
          content: [{ type: "text", text: formattedComments }],
        };
      } catch (error: any) {
        if (error.response?.status === 404) {
          return {
            content: [{ type: "text", text: `Ticket ${ticketId} not found.` }],
          };
        }
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to fetch comments: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "add_comment",
    "Add a comment to a Jira ticket. Supports mentions using [~accountId] or [~email@example.com] format.",
    {
      ticketId: z.string().describe("The Jira ticket ID"),
      comment: CommentSchema,
    },
    async ({ ticketId, comment }: { ticketId: string; comment: JiraComment }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();

        if (isCloud()) {
          const adfBody = await convertTextToADFWithMentions(comment.body, jiraApiClient);
          await jiraApiClient.post(`/issue/${ticketId}/comment`, {
            body: adfBody,
          });
        } else {
          try {
            await jira.issueComments.addComment({
              issueIdOrKey: ticketId,
              comment: comment.body,
            });
          } catch (jiraJsError: any) {
            if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
              await jiraApiClient.post(`/issue/${ticketId}/comment`, {
                body: comment.body,
              });
            } else {
              throw jiraJsError;
            }
          }
        }

        return {
          content: [{ type: "text", text: `Added comment to ${ticketId}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.response?.data?.message || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to add comment: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "delete_comment",
    "Delete a comment from a Jira ticket",
    {
      ticketId: z.string().describe("The Jira ticket ID (e.g., PROJECT-123)"),
      commentId: z.string().describe("The comment ID to delete"),
    },
    async ({ ticketId, commentId }: { ticketId: string; commentId: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();

        try {
          await jiraApiClient.delete(`/issue/${ticketId}/comment/${commentId}`);
        } catch (jiraJsError: any) {
          try {
            await jira.issueComments.deleteComment({
              issueIdOrKey: ticketId,
              id: commentId,
            });
          } catch (error: any) {
            throw jiraJsError;
          }
        }

        return {
          content: [{ type: "text", text: `Successfully deleted comment ${commentId} from ${ticketId}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.response?.data?.message || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to delete comment: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "delete_all_comments",
    "Delete all comments from a Jira ticket",
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
        let commentsResult: any;
        try {
          commentsResult = await jira.issueComments.getComments({ issueIdOrKey: ticketId });
        } catch (jiraJsError: any) {
          const jiraApiClient = createJiraApiClient();
          const response = await jiraApiClient.get(`/issue/${ticketId}/comment`);
          commentsResult = response.data;
        }

        const comments = commentsResult.comments || commentsResult.values || [];
        if (comments.length === 0) {
          return {
            content: [{ type: "text", text: `No comments found in ${ticketId}` }],
          };
        }

        const jiraApiClient = createJiraApiClient();
        let deletedCount = 0;
        const errors: string[] = [];

        for (const comment of comments) {
          const commentId = comment.id || comment.commentId;
          try {
            await jiraApiClient.delete(`/issue/${ticketId}/comment/${commentId}`);
            deletedCount++;
          } catch (error: any) {
            try {
              await jira.issueComments.deleteComment({
                issueIdOrKey: ticketId,
                id: commentId,
              });
              deletedCount++;
            } catch (deleteError: any) {
              errors.push(`Failed to delete comment ${commentId}: ${deleteError.message || deleteError.response?.data?.message || 'Unknown error'}`);
            }
          }
        }

        if (errors.length > 0) {
          return {
            content: [{ type: "text", text: `Deleted ${deletedCount} of ${comments.length} comments from ${ticketId}.\nErrors:\n${errors.join('\n')}` }],
          };
        }

        return {
          content: [{ type: "text", text: `Successfully deleted all ${deletedCount} comments from ${ticketId}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.response?.data?.message || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to delete comments: ${errorMessage}` }],
        };
      }
    }
  );
}
