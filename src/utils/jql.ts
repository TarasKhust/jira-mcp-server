// Validate and format project keys from comma-separated string
export function validateAndFormatProjectKeys(projectKeys: string): string[] {
  return projectKeys
    .split(',')
    .map(key => key.trim().toUpperCase())
    .filter(key => key.length > 0);
}

// Escape special characters in JQL text search
export function escapeJQLText(text: string): string {
  // Escape special characters: + - & | ! ( ) { } [ ] ^ ~ * ? \ /
  return text.replace(/[+\-&|!(){}[\]^~*?\\\/]/g, '\\$&');
}
