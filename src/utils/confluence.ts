import { URL } from 'url';
import type { ConfluenceUrlParts } from '../types.js';

// Parse Confluence page URL to extract pageId and spaceKey
export function parseConfluenceUrl(url: string): ConfluenceUrlParts {
  try {
    const parsedUrl = new URL(url);

    // Pattern 1: /spaces/{spaceKey}/pages/{pageId}/...
    const spacesMatch = parsedUrl.pathname.match(/\/spaces\/([^\/]+)\/pages\/(\d+)/);
    if (spacesMatch) {
      return { spaceKey: spacesMatch[1], pageId: spacesMatch[2] };
    }

    // Pattern 2: /display/{spaceKey}/{pageTitle}
    const displayMatch = parsedUrl.pathname.match(/\/display\/([^\/]+)\/(.+)/);
    if (displayMatch) {
      return {
        spaceKey: displayMatch[1],
        pageTitle: decodeURIComponent(displayMatch[2].replace(/\+/g, ' ')),
      };
    }

    // Pattern 3: /pages/viewpage.action?pageId={pageId}
    if (parsedUrl.pathname.includes('viewpage.action')) {
      const pageId = parsedUrl.searchParams.get('pageId');
      if (pageId) {
        return { pageId };
      }
    }

    return {};
  } catch {
    return {};
  }
}

// Convert Confluence storage format (XHTML) to plain text
export function convertStorageToPlainText(html: string): string {
  if (!html) return '';

  let text = html;

  // Replace common block elements with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n');
  text = text.replace(/<\/(td|th)>/gi, ' | ');

  // Handle list items
  text = text.replace(/<li[^>]*>/gi, '- ');

  // Handle headings (preserve as markdown-style)
  text = text.replace(/<h1[^>]*>/gi, '# ');
  text = text.replace(/<h2[^>]*>/gi, '## ');
  text = text.replace(/<h3[^>]*>/gi, '### ');
  text = text.replace(/<h4[^>]*>/gi, '#### ');
  text = text.replace(/<h5[^>]*>/gi, '##### ');
  text = text.replace(/<h6[^>]*>/gi, '###### ');

  // Handle links - extract href and text
  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)');

  // Handle images - extract alt text
  text = text.replace(/<img[^>]+alt="([^"]*)"[^>]*\/?>/gi, '[Image: $1]');
  text = text.replace(/<img[^>]*\/?>/gi, '[Image]');

  // Handle Confluence code blocks
  text = text.replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi, '\n```\n$1\n```\n');

  // Handle Confluence macros (info, note, warning, tip panels)
  text = text.replace(/<ac:structured-macro[^>]*ac:name="(info|note|warning|tip)"[^>]*>/gi, '\n[$1] ');
  text = text.replace(/<\/ac:structured-macro>/gi, '\n');

  // Strip Confluence-specific XML tags
  text = text.replace(/<ac:[^>]*>/gi, '');
  text = text.replace(/<\/ac:[^>]*>/gi, '');
  text = text.replace(/<ri:[^>]*>/gi, '');
  text = text.replace(/<\/ri:[^>]*>/gi, '');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Normalize whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}
