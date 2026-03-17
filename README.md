# @taraskhust/jira-mcp-server

MCP (Model Context Protocol) server for Jira and Confluence integration. Provides 32 tools for managing Jira tickets, sprints, boards, worklogs, and Confluence pages through any MCP-compatible client.

Supports both **Jira Cloud** and **Jira Server/Data Center**.

## Installation

### Via npm (recommended)

```bash
npx @taraskhust/jira-mcp-server
```

### Via npm global install

```bash
npm install -g @taraskhust/jira-mcp-server
jira-mcp-server
```

### From source

```bash
git clone https://github.com/taraskhust/jira-mcp-server.git
cd jira-mcp-server
npm install
npm run build
npm start
```

## Configuration

Create a `.env` file or pass environment variables directly:

### Required (Jira)

```env
JIRA_HOST=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
```

### Optional (Confluence/KB)

```env
CONFLUENCE_HOST=https://your-confluence.atlassian.net
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-api-token
```

### MCP Client Configuration

Add to your MCP client config (e.g., Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@taraskhust/jira-mcp-server"],
      "env": {
        "JIRA_HOST": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Available Tools

### Ticket Management
| Tool | Description |
|------|-------------|
| `list_tickets` | List tickets assigned to you (with optional JQL filter) |
| `get_ticket` | Get details of a specific ticket including linked issues |
| `create_ticket` | Create a new ticket with custom fields support |
| `search_tickets` | Full-text search across multiple projects |
| `delete_issue` | Delete a ticket |

### Comments
| Tool | Description |
|------|-------------|
| `add_comment` | Add a comment with @mention support |
| `get_comments` | Get all comments for a ticket |
| `delete_comment` | Delete a specific comment |
| `delete_all_comments` | Delete all comments from a ticket |

### Status & Workflow
| Tool | Description |
|------|-------------|
| `update_status` | Change ticket status via transitions |
| `get_transitions` | Get available status transitions |
| `assign_ticket` | Assign/unassign a ticket |

### Field Updates
| Tool | Description |
|------|-------------|
| `update_ticket_fields` | Update fields (story points, labels, priority, due date, custom fields, etc.) |
| `get_ticket_fields` | Get field metadata and current values |
| `get_available_fields` | Get available fields with IDs for a project/issue type |

### Time Tracking
| Tool | Description |
|------|-------------|
| `add_worklog` | Log time spent on a ticket |
| `get_worklog` | Get worklog entries |
| `update_worklog` | Update an existing worklog |
| `delete_worklog` | Delete a worklog entry |

### Issue Links
| Tool | Description |
|------|-------------|
| `create_issue_link` | Link two issues together |
| `remove_issue_link` | Remove an issue link |

### Projects & Versions
| Tool | Description |
|------|-------------|
| `get_all_projects` | List all projects |
| `get_project_issues` | Get issues for a project |
| `get_project_versions` | Get project versions |
| `create_version` | Create a new version |
| `batch_create_issues` | Create multiple issues at once |

### Agile / Sprints
| Tool | Description |
|------|-------------|
| `get_agile_boards` | List agile boards |
| `get_board_issues` | Get issues from a board |
| `get_sprints_from_board` | Get sprints from a board |
| `get_sprint_issues` | Get issues in a sprint |

### Users
| Tool | Description |
|------|-------------|
| `search_users` | Search users by email or name |
| `get_user_profile` | Get user profile info |

### Confluence / Knowledge Base
| Tool | Description |
|------|-------------|
| `get_kb_page` | Get a page by ID or URL |
| `search_kb_pages` | Search pages (text or CQL) |
| `get_kb_page_children` | Get child pages |
| `get_kb_page_comments` | Get page comments |
| `get_kb_spaces` | List available spaces |

## Getting a Jira API Token

1. Go to [Atlassian API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a label and copy the token

For Jira Server/Data Center, use your password or a personal access token.

## License

GPL-2.0 - See [LICENSE.txt](LICENSE.txt) for details.

Based on [jira-mcp-server](https://github.com/kornbed/jira-mcp-server) by kornbed.
