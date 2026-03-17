// Recursively extract text from Atlassian Document Format (ADF) nodes
export function extractTextFromADF(node: any): string {
  if (!node) return '';

  // Handle plain string descriptions (Jira Server v2 returns plain text)
  if (typeof node === 'string') return node;

  // Handle text nodes
  if (node.type === 'text') return node.text || '';

  // Handle media nodes (images/attachments)
  if (node.type === 'media' || node.type === 'mediaGroup' || node.type === 'mediaSingle') {
    if (node.attrs?.alt) return `[Image: ${node.attrs.alt}]`;
    if (node.attrs?.id) return `[Attachment: ${node.attrs.id}]`;
    if (node.content && Array.isArray(node.content)) {
      return node.content.map(extractTextFromADF).join('');
    }
    return '[Attachment]';
  }

  // Handle hard/soft breaks
  if (node.type === 'hardBreak') return '\n';

  // Handle inline card (links)
  if (node.type === 'inlineCard') return node.attrs?.url || '[Link]';

  // Handle mention
  if (node.type === 'mention') return `@${node.attrs?.text || 'user'}`;

  // Handle emoji
  if (node.type === 'emoji') return node.attrs?.shortName || node.attrs?.text || '';

  let text = '';

  // Recursively process content array
  if (node.content && Array.isArray(node.content)) {
    text = node.content.map(extractTextFromADF).join('');
  }

  // Add formatting based on node type
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'codeBlock':
    case 'blockquote':
    case 'rule':
      text += '\n';
      break;
    case 'listItem':
      text = '- ' + text.trim() + '\n';
      break;
    case 'tableRow':
      text += '\n';
      break;
    case 'tableCell':
    case 'tableHeader':
      text += ' | ';
      break;
  }

  return text;
}

// Process text and add mentions and issue links for ADF
export async function processTextSegment(text: string, jiraApiClient: any, jiraHost: string): Promise<any[]> {
  const nodes: any[] = [];

  // Combined pattern: mentions [~xxx] or issue keys (PROJECT-123)
  const combinedPattern = /(\[~([^\]]+)\])|([A-Z][A-Z0-9]+-\d+)/g;

  let lastIndex = 0;
  let match;

  while ((match = combinedPattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      nodes.push({
        type: 'text',
        text: text.substring(lastIndex, match.index),
      });
    }

    if (match[1]) {
      // This is a mention [~xxx]
      const mentionValue = match[2];
      let accountId = mentionValue;
      let displayName = mentionValue;

      // Check if it's an email, and try to find the accountId
      if (mentionValue.includes('@') && !mentionValue.startsWith('accountid:')) {
        try {
          const response = await jiraApiClient.get('/user/search', {
            params: {
              query: mentionValue,
              maxResults: 1,
            },
          });
          if (response.data && response.data.length > 0) {
            accountId = response.data[0].accountId;
            displayName = response.data[0].displayName || mentionValue;
          }
        } catch (searchError: any) {
          // If search fails, use the email as display name
          displayName = mentionValue;
        }
      } else if (mentionValue.startsWith('accountid:')) {
        // Format: [~accountid:xxx]
        accountId = mentionValue.replace('accountid:', '');
      }

      // Add mention node
      nodes.push({
        type: 'mention',
        attrs: {
          id: accountId,
          text: `@${displayName}`,
          accessLevel: '',
        },
      });
    } else if (match[3]) {
      // This is an issue key (PROJECT-123)
      const issueKey = match[3];
      const issueUrl = `${jiraHost}/browse/${issueKey}`;

      // Add text with link mark
      nodes.push({
        type: 'text',
        text: issueKey,
        marks: [
          {
            type: 'link',
            attrs: {
              href: issueUrl,
            },
          },
        ],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    nodes.push({
      type: 'text',
      text: text.substring(lastIndex),
    });
  }

  return nodes;
}

// Convert plain text with mentions to ADF format for Jira Cloud
export async function convertTextToADFWithMentions(text: string, jiraApiClient: any): Promise<any> {
  const jiraHost = process.env.JIRA_HOST || '';
  const content: any[] = [];

  // Split text by newlines first to handle paragraphs
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      continue; // Skip empty lines
    }

    const paragraphContent = await processTextSegment(paragraph, jiraApiClient, jiraHost);

    // If no content was added, add the whole paragraph as text
    if (paragraphContent.length === 0) {
      paragraphContent.push({
        type: 'text',
        text: paragraph,
      });
    }

    content.push({
      type: 'paragraph',
      content: paragraphContent,
    });
  }

  return {
    type: 'doc',
    version: 1,
    content: content,
  };
}
