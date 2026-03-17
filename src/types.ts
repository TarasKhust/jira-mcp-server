import { z } from 'zod';

export interface JiraTicket {
  summary: string;
  description: string;
  projectKey: string;
  issueType: string;
  parent?: string;
  customFields?: Record<string, unknown>;
}

export interface JiraComment {
  body: string;
}

export interface StatusUpdate {
  transitionId: string;
}

export interface ConfluenceUrlParts {
  pageId?: string;
  spaceKey?: string;
  pageTitle?: string;
}

export const TicketSchema = z.object({
  summary: z.string().describe("The ticket summary"),
  description: z.string().describe("The ticket description"),
  projectKey: z.string().describe("The project key (e.g., PROJECT)"),
  issueType: z.string().describe("The type of issue (e.g., Task, Bug)"),
  parent: z.string().optional().describe("The parent/epic key (for next-gen projects)"),
  customFields: z.record(z.any()).optional().describe("Custom fields as key-value pairs (e.g., { 'customfield_14500': 'EPIC-123', 'customfield_21702': { 'value': 'PMT' } })"),
});

export const CommentSchema = z.object({
  body: z.string().describe("The comment text"),
});

export const StatusUpdateSchema = z.object({
  transitionId: z.string().describe("The ID of the transition to perform"),
});
