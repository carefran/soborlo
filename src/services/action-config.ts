import * as core from '@actions/core'
import { ActionConfig, RepositoryInfo } from '../types/action'
import { ConfigurationError } from '../utils/error-handler'

export function getActionConfig(): ActionConfig {
  const config = {
    repo: core.getInput('repo'),
    notionToken: core.getInput('NOTION_API_KEY'),
    notionDatabaseId: core.getInput('NOTION_DATABASE_ID'),
    githubToken: core.getInput('PROJECT_TOKEN') || core.getInput('GITHUB_TOKEN') || undefined,
    includePullRequests: core.getInput('include_pull_requests').toLowerCase() === 'true',
    projectName: core.getInput('project_name') || undefined,
  }

  validateConfig(config)
  return config
}

function validateConfig(config: ActionConfig): void {
  if (!config.repo) {
    throw new ConfigurationError('Repository name is required', 'repo')
  }

  if (!config.notionToken) {
    throw new ConfigurationError('Notion API key is required', 'NOTION_API_KEY')
  }

  if (!config.notionDatabaseId) {
    throw new ConfigurationError('Notion database ID is required', 'NOTION_DATABASE_ID')
  }
}

export function parseRepositoryInfo(repo: string): RepositoryInfo {
  const [owner, repoName] = repo.split('/')
  if (!owner || !repoName) {
    throw new Error(`Invalid repository format: ${repo}. Expected format: owner/repo`)
  }
  return { owner, repoName }
}

export function logConfig(config: ActionConfig): void {
  console.log(`Syncing items from repository: ${config.repo}`)
  console.log(`Include Pull Requests: ${config.includePullRequests}`)
  if (config.projectName) {
    console.log(`Target Project: ${config.projectName}`)
  }
}