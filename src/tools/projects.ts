import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig, isCloud } from '../config.js';
import { jira, createJiraApiClient } from '../clients.js';

export function registerProjectTools(server: McpServer): void {
  server.tool(
    "get_all_projects",
    "Get all Jira projects",
    {},
    async () => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        let projects: any[];

        try {
          const projectsPage = await jira.projects.searchProjects({
            startAt: 0,
            maxResults: 1000,
          });
          projects = projectsPage.values || [];
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const response = await jiraApiClient.get('/project');
            projects = Array.isArray(response.data) ? response.data : [];
          } else {
            throw jiraJsError;
          }
        }

        if (projects.length === 0) {
          return {
            content: [{ type: "text", text: "No projects found" }],
          };
        }

        const formattedProjects = projects.map((project: any) => {
          return `${project.key}: ${project.name} (${project.projectTypeKey || 'standard'})`;
        }).join('\n');

        return {
          content: [{ type: "text", text: formattedProjects }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to fetch projects: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_project_issues",
    "Get all issues for a specific project",
    {
      projectKey: z.string().describe("The project key (e.g., PROJECT)"),
      maxResults: z.number().optional().describe("Maximum number of results to return"),
    },
    async ({ projectKey, maxResults = 50 }: { projectKey: string; maxResults?: number }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        let issues: any;
        const jiraApiClient = createJiraApiClient();

        if (isCloud()) {
          try {
            const response = await jiraApiClient.post('/search/jql', {
              jql: `project = ${projectKey} ORDER BY updated DESC`,
              maxResults,
            });
            issues = response.data;
          } catch (cloudError: any) {
            const errorDetails = cloudError.response?.data || cloudError.message;
            throw new Error(`Jira Cloud API v3 error: ${JSON.stringify(errorDetails)}`);
          }
        } else {
          try {
            issues = await jira.issueSearch.searchForIssuesUsingJql({
              jql: `project = ${projectKey} ORDER BY updated DESC`,
              maxResults,
            });
          } catch (jiraJsError: any) {
            const response = await jiraApiClient.get('/search', {
              params: {
                jql: `project = ${projectKey} ORDER BY updated DESC`,
                maxResults,
              },
            });
            issues = response.data;
          }
        }

        if (!issues.issues || issues.issues.length === 0) {
          return {
            content: [{ type: "text", text: `No issues found for project ${projectKey}` }],
          };
        }

        const formattedIssues = issues.issues.map((issue: any) => {
          const summary = issue.fields?.summary || 'No summary';
          const status = issue.fields?.status?.name || 'Unknown status';
          return `${issue.key}: ${summary} (${status})`;
        }).join('\n');

        return {
          content: [{ type: "text", text: formattedIssues }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to fetch project issues: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_project_versions",
    "Get all versions for a project",
    {
      projectKey: z.string().describe("The project key (e.g., PROJECT)"),
    },
    async ({ projectKey }: { projectKey: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        let project: any;

        try {
          project = await jira.projects.getProject({ projectIdOrKey: projectKey });
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const response = await jiraApiClient.get(`/project/${projectKey}`);
            project = response.data;
          } else {
            throw jiraJsError;
          }
        }

        const versions = project.versions || [];
        if (versions.length === 0) {
          return {
            content: [{ type: "text", text: `No versions found for project ${projectKey}` }],
          };
        }

        const formattedVersions = versions.map((version: any) => {
          const released = version.released ? 'Released' : 'Unreleased';
          const archived = version.archived ? 'Archived' : 'Active';
          return `${version.name}: ${released}, ${archived}${version.releaseDate ? ` (${version.releaseDate})` : ''}`;
        }).join('\n');

        return {
          content: [{ type: "text", text: formattedVersions }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get project versions: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "create_version",
    "Create a new version in a project",
    {
      projectKey: z.string().describe("The project key"),
      name: z.string().describe("The version name"),
      description: z.string().optional().describe("Optional version description"),
      releaseDate: z.string().optional().describe("Optional release date (YYYY-MM-DD)"),
    },
    async ({ projectKey, name, description, releaseDate }: { projectKey: string; name: string; description?: string; releaseDate?: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        let project: any;

        try {
          project = await jira.projects.getProject({ projectIdOrKey: projectKey });
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            const response = await jiraApiClient.get(`/project/${projectKey}`);
            project = response.data;
          } else {
            throw jiraJsError;
          }
        }

        const projectId = typeof project.id === 'string' ? parseInt(project.id) : project.id;
        const versionData: any = { name, projectId };
        if (description) versionData.description = description;
        if (releaseDate) versionData.releaseDate = releaseDate;

        try {
          await jira.projectVersions.createVersion(versionData);
        } catch (jiraJsError: any) {
          if (jiraJsError.response?.status === 404 || jiraJsError.message?.includes('404')) {
            const jiraApiClient = createJiraApiClient();
            await jiraApiClient.post(`/version`, versionData);
          } else {
            throw jiraJsError;
          }
        }

        return {
          content: [{ type: "text", text: `Successfully created version ${name} in project ${projectKey}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to create version: ${errorMessage}` }],
        };
      }
    }
  );
}
