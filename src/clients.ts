import { Version3Client } from 'jira.js';
import axios from 'axios';
import { isCloud } from './config.js';

// Initialize Jira client (jira.js)
export const jira = new Version3Client({
  host: process.env.JIRA_HOST!,
  authentication: {
    basic: {
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
    },
  },
});

// Create axios client for Jira REST API (Cloud uses v3, Server uses v2)
export function createJiraApiClient() {
  const apiVersion = isCloud() ? '3' : '2';

  return axios.create({
    baseURL: `${process.env.JIRA_HOST}/rest/api/${apiVersion}`,
    auth: {
      username: process.env.JIRA_EMAIL!,
      password: process.env.JIRA_API_TOKEN!,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

// Create axios client for Confluence REST API
export function createConfluenceApiClient() {
  return axios.create({
    baseURL: `${process.env.CONFLUENCE_HOST}/rest/api`,
    auth: {
      username: process.env.CONFLUENCE_EMAIL!,
      password: process.env.CONFLUENCE_API_TOKEN!,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
