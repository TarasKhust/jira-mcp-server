#!/usr/bin/env node
import './config.js'; // Load environment variables first
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateJiraConfig, validateConfluenceConfig } from './config.js';
import { registerTicketTools } from './tools/tickets.js';
import { registerCommentTools } from './tools/comments.js';
import { registerWorkflowTools } from './tools/workflow.js';
import { registerFieldTools } from './tools/fields.js';
import { registerWorklogTools } from './tools/worklogs.js';
import { registerIssueLinkTools } from './tools/issue-links.js';
import { registerProjectTools } from './tools/projects.js';
import { registerBatchTools } from './tools/batch.js';
import { registerAgileTools } from './tools/agile.js';
import { registerUserTools } from './tools/users.js';
import { registerConfluenceTools } from './tools/confluence.js';

// Create server instance
const server = new McpServer({
  name: "jira",
  version: "1.0.0"
});

// Register all tool groups
registerTicketTools(server);
registerCommentTools(server);
registerWorkflowTools(server);
registerFieldTools(server);
registerWorklogTools(server);
registerIssueLinkTools(server);
registerProjectTools(server);
registerBatchTools(server);
registerAgileTools(server);
registerUserTools(server);
registerConfluenceTools(server);

// Start the server
async function main() {
  try {
    const configError = validateJiraConfig();
    if (configError) {
      console.error(`Jira configuration error: ${configError}`);
      console.error("Please configure the required environment variables.");
      console.error("Starting server in limited mode (tools will return configuration instructions)");
    }

    const confluenceConfigError = validateConfluenceConfig();
    if (confluenceConfigError) {
      console.error(`Confluence configuration: ${confluenceConfigError}`);
      console.error("KB tools will return configuration instructions when called");
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Jira MCP Server running on stdio");
  } catch (error) {
    console.error("Error starting Jira MCP server:", error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.error('Received SIGINT signal, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM signal, shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
