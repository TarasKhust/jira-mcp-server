import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateConfluenceConfig } from '../config.js';
import { createConfluenceApiClient } from '../clients.js';
import { parseConfluenceUrl, convertStorageToPlainText } from '../utils/confluence.js';

export function registerConfluenceTools(server: McpServer): void {
  server.tool(
    "get_kb_page",
    "Get a Confluence/KB page by page ID or full URL. Returns page title, space, content (as plain text), version, and metadata.",
    {
      pageId: z.string().optional().describe("The Confluence page ID (e.g., '2734657709')"),
      url: z.string().optional().describe("Full Confluence page URL (e.g., 'https://kb.example.com/spaces/SPACE/pages/123/...')"),
      includeRawContent: z.boolean().optional().describe("If true, also return raw storage format HTML. Default: false"),
    },
    async ({ pageId, url, includeRawContent = false }) => {
      const configError = validateConfluenceConfig();
      if (configError) {
        return {
          content: [{ type: "text" as const, text: `Confluence configuration error: ${configError}. Please set CONFLUENCE_HOST, CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN.` }],
        };
      }

      let resolvedPageId = pageId;
      let spaceKey: string | undefined;
      let pageTitle: string | undefined;

      if (!resolvedPageId && url) {
        const parsed = parseConfluenceUrl(url);
        resolvedPageId = parsed.pageId;
        spaceKey = parsed.spaceKey;
        pageTitle = parsed.pageTitle;
      }

      if (!resolvedPageId && !pageTitle) {
        return {
          content: [{ type: "text" as const, text: "Either pageId or url must be provided" }],
        };
      }

      try {
        const client = createConfluenceApiClient();
        let page: any;

        if (resolvedPageId) {
          const response = await client.get(`/content/${resolvedPageId}`, {
            params: { expand: 'body.storage,version,space,ancestors' },
          });
          page = response.data;
        } else {
          const response = await client.get('/content', {
            params: {
              spaceKey,
              title: pageTitle,
              expand: 'body.storage,version,space,ancestors',
            },
          });
          if (!response.data.results || response.data.results.length === 0) {
            return {
              content: [{ type: "text" as const, text: `Page not found: "${pageTitle}" in space ${spaceKey}` }],
            };
          }
          page = response.data.results[0];
        }

        const plainText = convertStorageToPlainText(page.body?.storage?.value || '');
        const ancestors = (page.ancestors || []).map((a: any) => a.title).join(' > ');

        const output = [
          `Title: ${page.title}`,
          `Space: ${page.space?.key} (${page.space?.name || ''})`,
          `Page ID: ${page.id}`,
          `Version: ${page.version?.number || 'unknown'} (by ${page.version?.by?.displayName || 'unknown'}, ${page.version?.when || ''})`,
          `URL: ${process.env.CONFLUENCE_HOST}/pages/viewpage.action?pageId=${page.id}`,
          ancestors ? `Path: ${ancestors} > ${page.title}` : '',
          `\nContent:\n${plainText}`,
        ].filter(Boolean);

        if (includeRawContent) {
          output.push(`\nRaw Storage Format:\n${page.body?.storage?.value || ''}`);
        }

        return {
          content: [{ type: "text" as const, text: output.join('\n') }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text" as const, text: `Failed to get KB page: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "search_kb_pages",
    "Search for Confluence/KB pages by text, title, or CQL query. Returns matching pages with titles, spaces, and URLs.",
    {
      query: z.string().describe("Search text or CQL query (e.g., 'migration guide' or 'type=page AND space=SPACE AND title~\"ADR\"')"),
      spaceKey: z.string().optional().describe("Optional space key to limit search"),
      maxResults: z.number().optional().describe("Maximum number of results (default: 10, max: 50)"),
      useCql: z.boolean().optional().describe("If true, treat query as CQL. Default: false (simple text search)"),
    },
    async ({ query, spaceKey, maxResults = 10, useCql = false }) => {
      const configError = validateConfluenceConfig();
      if (configError) {
        return {
          content: [{ type: "text" as const, text: `Confluence configuration error: ${configError}. Please set CONFLUENCE_HOST, CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN.` }],
        };
      }

      try {
        const client = createConfluenceApiClient();
        let cql: string;

        if (useCql) {
          cql = query;
        } else {
          cql = `type=page AND text~"${query}"`;
          if (spaceKey) {
            cql += ` AND space="${spaceKey}"`;
          }
        }

        const response = await client.get('/content/search', {
          params: {
            cql,
            limit: Math.min(maxResults, 50),
            expand: 'space,version',
          },
        });

        const results = response.data;
        if (!results.results || results.results.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No pages found matching "${query}"` }],
          };
        }

        const formattedResults = results.results.map((page: any) => {
          const space = page.space?.key || 'Unknown';
          const version = page.version?.number || '?';
          const lastUpdated = page.version?.when ? new Date(page.version.when).toLocaleString() : 'unknown';
          const pageUrl = `${process.env.CONFLUENCE_HOST}/pages/viewpage.action?pageId=${page.id}`;
          return `[${space}] ${page.title} (ID: ${page.id})\n  Version: ${version}, Updated: ${lastUpdated}\n  URL: ${pageUrl}`;
        }).join('\n----------------------------------------\n');

        const totalSize = results.totalSize || results.size || results.results.length;
        const header = `Found ${totalSize} page(s) matching "${query}"\n\n`;

        return {
          content: [{ type: "text" as const, text: header + formattedResults }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text" as const, text: `Failed to search KB pages: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_kb_page_children",
    "Get child pages of a Confluence/KB page. Useful for navigating page hierarchies.",
    {
      pageId: z.string().describe("The parent page ID"),
      maxResults: z.number().optional().describe("Maximum number of results (default: 25)"),
    },
    async ({ pageId, maxResults = 25 }) => {
      const configError = validateConfluenceConfig();
      if (configError) {
        return {
          content: [{ type: "text" as const, text: `Confluence configuration error: ${configError}. Please set CONFLUENCE_HOST, CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN.` }],
        };
      }

      try {
        const client = createConfluenceApiClient();
        const response = await client.get(`/content/${pageId}/child/page`, {
          params: { limit: maxResults, expand: 'version,space' },
        });

        const children = response.data.results || [];
        if (children.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No child pages found for page ID ${pageId}` }],
          };
        }

        const formatted = children.map((child: any) => {
          const pageUrl = `${process.env.CONFLUENCE_HOST}/pages/viewpage.action?pageId=${child.id}`;
          return `${child.title} (ID: ${child.id})\n  URL: ${pageUrl}`;
        }).join('\n');

        return {
          content: [{ type: "text" as const, text: `Child pages of ${pageId}:\n\n${formatted}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text" as const, text: `Failed to get child pages: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_kb_page_comments",
    "Get comments on a Confluence/KB page",
    {
      pageId: z.string().describe("The page ID to get comments for"),
      maxResults: z.number().optional().describe("Maximum number of comments (default: 25)"),
    },
    async ({ pageId, maxResults = 25 }) => {
      const configError = validateConfluenceConfig();
      if (configError) {
        return {
          content: [{ type: "text" as const, text: `Confluence configuration error: ${configError}. Please set CONFLUENCE_HOST, CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN.` }],
        };
      }

      try {
        const client = createConfluenceApiClient();
        const response = await client.get(`/content/${pageId}/child/comment`, {
          params: { limit: maxResults, expand: 'body.storage,version' },
        });

        const comments = response.data.results || [];
        if (comments.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No comments found on page ${pageId}` }],
          };
        }

        const formatted = comments.map((comment: any, idx: number) => {
          const author = comment.version?.by?.displayName || 'Unknown';
          const date = comment.version?.when ? new Date(comment.version.when).toLocaleString() : 'unknown';
          const body = convertStorageToPlainText(comment.body?.storage?.value || '');
          return `Comment #${idx + 1} by ${author} (${date}):\n${body}`;
        }).join('\n----------------------------------------\n');

        return {
          content: [{ type: "text" as const, text: `Comments on page ${pageId}:\n\n${formatted}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text" as const, text: `Failed to get comments: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_kb_spaces",
    "List available Confluence/KB spaces. Useful for discovering space keys before searching.",
    {
      type: z.string().optional().describe("Filter by space type: 'global' or 'personal'. Default: all"),
      maxResults: z.number().optional().describe("Maximum number of results (default: 50)"),
    },
    async ({ type, maxResults = 50 }) => {
      const configError = validateConfluenceConfig();
      if (configError) {
        return {
          content: [{ type: "text" as const, text: `Confluence configuration error: ${configError}. Please set CONFLUENCE_HOST, CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN.` }],
        };
      }

      try {
        const client = createConfluenceApiClient();
        const params: any = { limit: maxResults };
        if (type) params.type = type;

        const response = await client.get('/space', { params });

        const spaces = response.data.results || [];
        if (spaces.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No spaces found" }],
          };
        }

        const formatted = spaces.map((space: any) => {
          return `${space.key}: ${space.name} (${space.type})`;
        }).join('\n');

        return {
          content: [{ type: "text" as const, text: formatted }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data?.errorMessages?.join(', ') || error.message || 'Unknown error';
        return {
          content: [{ type: "text" as const, text: `Failed to list spaces: ${errorMessage}` }],
        };
      }
    }
  );
}
