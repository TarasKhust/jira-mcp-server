import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - prioritize process.env (from mcp.json) over .env file
// Only load .env if variables are not already set (for local development)
if (!process.env.JIRA_HOST || !process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN || !process.env.CONFLUENCE_HOST) {
  dotenv.config();
  try {
    dotenv.config({ path: path.resolve(__dirname, '../.env') });
  } catch (e) {
    // Ignore .env file errors if not found
  }
}

export function validateJiraConfig(): string | null {
  if (!process.env.JIRA_HOST) return "JIRA_HOST environment variable is not set";
  if (!process.env.JIRA_EMAIL) return "JIRA_EMAIL environment variable is not set";
  if (!process.env.JIRA_API_TOKEN) return "JIRA_API_TOKEN environment variable is not set";
  return null;
}

export function validateConfluenceConfig(): string | null {
  if (!process.env.CONFLUENCE_HOST) return "CONFLUENCE_HOST environment variable is not set";
  if (!process.env.CONFLUENCE_EMAIL) return "CONFLUENCE_EMAIL environment variable is not set";
  if (!process.env.CONFLUENCE_API_TOKEN) return "CONFLUENCE_API_TOKEN environment variable is not set";
  return null;
}

export function isCloud(): boolean {
  return process.env.JIRA_HOST?.includes('.atlassian.net') || false;
}
