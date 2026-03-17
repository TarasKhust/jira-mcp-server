import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateJiraConfig, isCloud } from '../config.js';
import { jira, createJiraApiClient } from '../clients.js';

export function registerFieldTools(server: McpServer): void {
  server.tool(
    "update_ticket_fields",
    "Update fields of a Jira ticket (e.g., original estimate, story points, labels, assignee, priority, due date, etc.)",
    {
      ticketId: z.string().describe("The Jira ticket ID (e.g., PROJECT-123)"),
      originalEstimate: z.string().optional().describe("Original estimate in Jira time format (e.g., '1d', '2h', '1w 2d 3h', '30m')"),
      remainingEstimate: z.string().optional().describe("Remaining estimate in Jira time format"),
      storyPoints: z.number().optional().describe("Story points (numeric value)"),
      labels: z.array(z.string()).optional().describe("Array of labels to set"),
      summary: z.string().optional().describe("Ticket summary"),
      description: z.string().optional().describe("Ticket description"),
      assignee: z.string().optional().describe("Assignee email, accountId, or username. Use 'null' to unassign"),
      reporter: z.string().optional().describe("Reporter email, accountId, or username"),
      priority: z.string().optional().describe("Priority name (e.g., 'Urgent', 'High', 'Medium', 'Normal', 'Low', 'Lowest', 'Unprioritized')"),
      dueDate: z.string().optional().describe("Due date in ISO format (YYYY-MM-DD) or 'null' to remove"),
      customFields: z.record(z.any()).optional().describe("Custom fields as key-value pairs where key is field ID (e.g., 'customfield_10000': 'value')"),
    },
    async ({ ticketId, originalEstimate, remainingEstimate, storyPoints, labels, summary, description, assignee, reporter, priority, dueDate, customFields }: {
      ticketId: string;
      originalEstimate?: string;
      remainingEstimate?: string;
      storyPoints?: number;
      labels?: string[];
      summary?: string;
      description?: string;
      assignee?: string;
      reporter?: string;
      priority?: string;
      dueDate?: string;
      customFields?: Record<string, any>;
    }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const fields: any = {};

        // Time tracking fields
        if (originalEstimate || remainingEstimate) {
          fields.timetracking = {};
          if (originalEstimate) {
            fields.timetracking.originalEstimate = originalEstimate;
          }
          if (remainingEstimate) {
            fields.timetracking.remainingEstimate = remainingEstimate;
          }
        }

        // Story points — common Jira Cloud field IDs (may vary per instance)
        if (storyPoints !== undefined) {
          fields.customfield_10016 = storyPoints;
          fields['customfield_10020'] = storyPoints;
        }

        if (labels && labels.length > 0) {
          fields.labels = labels;
        }

        if (summary) {
          fields.summary = summary;
        }

        if (description) {
          if (isCloud()) {
            fields.description = {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: description }]
                }
              ]
            };
          } else {
            fields.description = description;
          }
        }

        if (assignee !== undefined) {
          if (assignee === 'null' || assignee === null) {
            fields.assignee = null;
          } else if (isCloud() && assignee.includes(':')) {
            fields.assignee = { accountId: assignee };
          } else if (isCloud()) {
            fields.assignee = { emailAddress: assignee };
          } else {
            fields.assignee = { name: assignee };
          }
        }

        if (reporter !== undefined) {
          if (isCloud() && reporter.includes(':')) {
            fields.reporter = { accountId: reporter };
          } else if (isCloud()) {
            fields.reporter = { emailAddress: reporter };
          } else {
            fields.reporter = { name: reporter };
          }
        }

        if (priority) {
          fields.priority = { name: priority };
        }

        if (dueDate !== undefined) {
          if (dueDate === 'null' || dueDate === null) {
            fields.duedate = null;
          } else {
            fields.duedate = dueDate;
          }
        }

        // Custom fields
        if (customFields && Object.keys(customFields).length > 0) {
          Object.assign(fields, customFields);
        }

        if (Object.keys(fields).length === 0) {
          return {
            content: [{ type: "text", text: "No fields provided to update" }],
          };
        }

        const updateData = { fields };

        if (isCloud()) {
          await jira.issues.editIssue({
            issueIdOrKey: ticketId,
            fields: fields,
          });
        } else {
          const jiraApiClient = createJiraApiClient();
          await jiraApiClient.put(`/issue/${ticketId}`, updateData);
        }

        const updatedFields = [];
        if (originalEstimate) updatedFields.push(`Original Estimate: ${originalEstimate}`);
        if (remainingEstimate) updatedFields.push(`Remaining Estimate: ${remainingEstimate}`);
        if (storyPoints !== undefined) updatedFields.push(`Story Points: ${storyPoints}`);
        if (labels && labels.length > 0) updatedFields.push(`Labels: ${labels.join(', ')}`);
        if (summary) updatedFields.push(`Summary: ${summary}`);
        if (description) updatedFields.push(`Description: updated`);
        if (assignee !== undefined) updatedFields.push(`Assignee: ${assignee === 'null' ? 'Unassigned' : assignee}`);
        if (reporter !== undefined) updatedFields.push(`Reporter: ${reporter}`);
        if (priority) updatedFields.push(`Priority: ${priority}`);
        if (dueDate !== undefined) updatedFields.push(`Due Date: ${dueDate === 'null' ? 'Removed' : dueDate}`);
        if (customFields && Object.keys(customFields).length > 0) {
          updatedFields.push(`Custom Fields: ${Object.keys(customFields).join(', ')}`);
        }

        return {
          content: [{ type: "text", text: `Successfully updated ${ticketId}:\n${updatedFields.join('\n')}` }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.response?.data?.message || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to update ticket fields: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_ticket_fields",
    "Get all available fields and their metadata for a Jira ticket (useful for finding custom field IDs)",
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
        let editmeta: any;
        const jiraApiClient = createJiraApiClient();

        try {
          const response = await jiraApiClient.get(`/issue/${ticketId}/editmeta`);
          editmeta = response.data;
        } catch (error: any) {
          try {
            const issue = await jira.issues.getIssue({
              issueIdOrKey: ticketId,
              expand: ['names'],
            });

            const fieldsInfo: string[] = [];
            fieldsInfo.push(`Available fields for ${ticketId}:\n`);

            if (issue.fields) {
              Object.keys(issue.fields).forEach((fieldKey) => {
                const fieldValue = issue.fields[fieldKey as keyof typeof issue.fields];
                if (fieldValue !== null && fieldValue !== undefined) {
                  const fieldName = (issue.names as any)?.[fieldKey] || fieldKey;
                  let valueStr = '';

                  if (typeof fieldValue === 'object') {
                    if (Array.isArray(fieldValue)) {
                      valueStr = fieldValue.map((v: any) => v.name || v.value || v).join(', ');
                    } else if (fieldValue.name) {
                      valueStr = fieldValue.name;
                    } else if (fieldValue.value) {
                      valueStr = fieldValue.value;
                    } else {
                      valueStr = JSON.stringify(fieldValue).substring(0, 100);
                    }
                  } else {
                    valueStr = String(fieldValue);
                  }

                  fieldsInfo.push(`${fieldKey} (${fieldName}): ${valueStr}`);
                }
              });
            }

            return {
              content: [{ type: "text", text: fieldsInfo.join('\n') }],
            };
          } catch (fallbackError: any) {
            throw error;
          }
        }

        const fieldsInfo: string[] = [];
        fieldsInfo.push(`Editable fields for ${ticketId}:\n`);

        if (editmeta.fields) {
          Object.keys(editmeta.fields).forEach((fieldKey) => {
            const field = editmeta.fields[fieldKey];
            const fieldName = field.name || fieldKey;
            const fieldType = field.schema?.type || 'unknown';
            const fieldId = field.schema?.customId || fieldKey;

            let fieldInfo = `${fieldKey}`;
            if (fieldId !== fieldKey) {
              fieldInfo += ` (ID: ${fieldId})`;
            }
            fieldInfo += ` - ${fieldName} (${fieldType})`;

            if (field.allowedValues && Array.isArray(field.allowedValues)) {
              const values = field.allowedValues.map((v: any) => v.name || v.value || v).join(', ');
              fieldInfo += `\n  Allowed values: ${values}`;
            }

            fieldsInfo.push(fieldInfo);
          });
        }

        try {
          const issue = await jira.issues.getIssue({
            issueIdOrKey: ticketId,
            expand: ['names'],
          });

          fieldsInfo.push(`\n\nCurrent field values:\n`);
          if (issue.fields) {
            Object.keys(issue.fields).forEach((fieldKey) => {
              const fieldValue = issue.fields[fieldKey as keyof typeof issue.fields];
              if (fieldValue !== null && fieldValue !== undefined) {
                const fieldName = (issue.names as any)?.[fieldKey] || fieldKey;
                let valueStr = '';

                if (typeof fieldValue === 'object') {
                  if (Array.isArray(fieldValue)) {
                    valueStr = fieldValue.map((v: any) => v.name || v.value || v).join(', ');
                  } else if (fieldValue.name) {
                    valueStr = fieldValue.name;
                  } else if (fieldValue.value) {
                    valueStr = fieldValue.value;
                  } else if (fieldValue.originalEstimate) {
                    valueStr = `Original: ${fieldValue.originalEstimate}, Remaining: ${fieldValue.remainingEstimate || 'N/A'}`;
                  } else {
                    valueStr = JSON.stringify(fieldValue).substring(0, 100);
                  }
                } else {
                  valueStr = String(fieldValue);
                }

                fieldsInfo.push(`${fieldKey}: ${valueStr}`);
              }
            });
          }
        } catch (issueError: any) {
          // Ignore if we can't get issue details
        }

        return {
          content: [{ type: "text", text: fieldsInfo.join('\n') }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.response?.data?.message || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get ticket fields: ${errorMessage}` }],
        };
      }
    }
  );

  server.tool(
    "get_available_fields",
    "Get all available fields for a Jira ticket with their metadata and field IDs. Returns a mapping of field names to field IDs that can be used in update_ticket_fields.",
    {
      ticketId: z.string().optional().describe("The Jira ticket ID (e.g., PROJECT-123). If not provided, returns fields for creating new tickets in the project."),
      projectKey: z.string().optional().describe("Project key (e.g., NDU). Required if ticketId is not provided."),
      issueType: z.string().optional().describe("Issue type (e.g., Task, Bug). Optional, helps filter fields."),
    },
    async ({ ticketId, projectKey, issueType }: { ticketId?: string; projectKey?: string; issueType?: string }) => {
      const configError = validateJiraConfig();
      if (configError) {
        return {
          content: [{ type: "text", text: `Configuration error: ${configError}` }],
        };
      }

      try {
        const jiraApiClient = createJiraApiClient();
        let editmeta: any;

        if (ticketId) {
          try {
            const response = await jiraApiClient.get(`/issue/${ticketId}/editmeta`);
            editmeta = response.data;
          } catch (error: any) {
            return {
              content: [{ type: "text", text: `Failed to get editmeta: ${error.response?.data?.errorMessages?.join(', ') || error.message}` }],
            };
          }
        } else if (projectKey) {
          try {
            const params: any = { projectKeys: projectKey };
            if (issueType) {
              params.issuetypeNames = issueType;
            }
            const response = await jiraApiClient.get('/issue/createmeta', { params });
            const project = response.data.projects?.[0];
            if (project) {
              const issueTypeMeta = issueType
                ? project.issuetypes.find((it: any) => it.name === issueType)
                : project.issuetypes?.[0];
              if (issueTypeMeta) {
                editmeta = { fields: issueTypeMeta.fields };
              }
            }
          } catch (error: any) {
            return {
              content: [{ type: "text", text: `Failed to get createmeta: ${error.response?.data?.errorMessages?.join(', ') || error.message}` }],
            };
          }
        } else {
          return {
            content: [{ type: "text", text: "Either ticketId or projectKey must be provided" }],
          };
        }

        if (!editmeta || !editmeta.fields) {
          return {
            content: [{ type: "text", text: "No fields found" }],
          };
        }

        const fieldsMapping: any = {};
        const fieldsInfo: string[] = [];
        fieldsInfo.push(`Available fields mapping:\n`);
        fieldsInfo.push(`Format: fieldKey (fieldName) - type - operations\n`);
        fieldsInfo.push(`---\n`);

        Object.keys(editmeta.fields).forEach((fieldKey) => {
          const field = editmeta.fields[fieldKey];
          const fieldName = field.name || fieldKey;
          const fieldType = field.schema?.type || 'unknown';
          const customId = field.schema?.customId || field.schema?.custom || null;
          const operations = field.operations || [];
          const required = field.required || false;

          const normalizedKey = fieldName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

          fieldsMapping[normalizedKey] = {
            fieldKey: fieldKey,
            fieldName: fieldName,
            fieldType: fieldType,
            customId: customId,
            operations: operations,
            required: required,
            allowedValues: field.allowedValues || null,
          };

          let fieldInfo = `${fieldKey}`;
          if (customId && customId !== fieldKey) {
            fieldInfo += ` (customId: ${customId})`;
          }
          fieldInfo += ` - ${fieldName}`;
          fieldInfo += ` [${fieldType}]`;
          if (required) {
            fieldInfo += ` *REQUIRED*`;
          }
          if (operations.length > 0) {
            fieldInfo += ` - ops: [${operations.join(', ')}]`;
          }

          if (field.allowedValues && Array.isArray(field.allowedValues) && field.allowedValues.length > 0) {
            const values = field.allowedValues.slice(0, 5).map((v: any) => v.name || v.value || v).join(', ');
            const more = field.allowedValues.length > 5 ? ` ... (+${field.allowedValues.length - 5} more)` : '';
            fieldInfo += `\n  Allowed values: ${values}${more}`;
          }

          fieldsInfo.push(fieldInfo);
        });

        fieldsInfo.push(`\n---\n`);
        fieldsInfo.push(`\nNormalized field mapping (for use in update_ticket_fields with customFields):\n`);
        Object.keys(fieldsMapping).sort().forEach((normalizedKey) => {
          const mapping = fieldsMapping[normalizedKey];
          fieldsInfo.push(`${normalizedKey} -> ${mapping.fieldKey} (${mapping.fieldName})`);
        });

        const jsonMapping = JSON.stringify(fieldsMapping, null, 2);
        fieldsInfo.push(`\n---\n`);
        fieldsInfo.push(`\nJSON mapping:\n${jsonMapping}`);

        return {
          content: [{ type: "text", text: fieldsInfo.join('\n') }],
        };
      } catch (error: any) {
        const errorMessage = error.response?.data?.errorMessages?.join(', ') || error.response?.data?.message || error.message || 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to get available fields: ${errorMessage}` }],
        };
      }
    }
  );
}
