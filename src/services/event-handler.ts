import * as github from '@actions/github'
import { EventType, EventContext } from '../types/action'
import { GitHubItem } from '../types/github'
import { getProjectItems, getSingleIssue, getSinglePullRequest, getIssuesAndPullRequests } from './github'
import { RepositoryInfo, ActionConfig } from '../types/action'
import { logger } from '../utils/logger'

export function getEventContext(): EventContext {
  const eventName = process.env.GITHUB_EVENT_NAME ?? ''
  
  // EventTypeの判定
  let eventType: EventType | null = null
  if (Object.values(EventType).includes(eventName as EventType)) {
    eventType = eventName as EventType
  }

  const context: EventContext = {
    eventName,
    eventType,
    issueNumber: github.context.payload.issue?.number,
    pullRequestNumber: github.context.payload.pull_request?.number,
  }

  return context
}

export function isScheduledOrManualEvent(eventType: EventType | null): boolean {
  return eventType === EventType.SCHEDULE || eventType === EventType.WORKFLOW_DISPATCH
}

export async function fetchItemsBasedOnEvent(
  eventContext: EventContext,
  repositoryInfo: RepositoryInfo,
  config: ActionConfig,
): Promise<GitHubItem[]> {
  const { eventType, issueNumber, pullRequestNumber } = eventContext
  const { owner, repoName } = repositoryInfo

  logger.info(`Event type: ${eventContext.eventName}`)

  if (isScheduledOrManualEvent(eventType)) {
    logger.info('Scheduled or manual execution: fetching items from GitHub Projects')
    return await getProjectItems(owner, config.projectName, config.githubToken)
  }

  if (eventType === EventType.ISSUES) {
    logger.info('Issue event: processing single issue from context')
    if (!issueNumber) {
      logger.error('Issue number not found in context')
      return []
    }
    
    const singleIssue = await getSingleIssue(owner, repoName, issueNumber, config.githubToken)
    return singleIssue ? [singleIssue] : []
  }

  if (eventType === EventType.PULL_REQUEST) {
    logger.info('Pull Request event: processing single PR from context')
    if (!pullRequestNumber) {
      logger.error('PR number not found in context')
      return []
    }
    
    const singlePR = await getSinglePullRequest(owner, repoName, pullRequestNumber, config.githubToken)
    return singlePR ? [singlePR] : []
  }

  // Fallback for unknown events
  logger.info('Unknown event type: falling back to 24-hour filter')
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  return await getIssuesAndPullRequests(
    config.repo, 
    config.includePullRequests, 
    config.githubToken, 
    since,
  )
}

export function getItemsSyncMessage(
  items: GitHubItem[], 
  eventContext: EventContext, 
  config: ActionConfig,
): string {
  const { eventType } = eventContext
  const count = items.length

  if (isScheduledOrManualEvent(eventType)) {
    return `Found ${count} items to sync from GitHub Projects`
  }

  if (eventType === EventType.ISSUES) {
    return `Found ${count} items to sync (single issue from event)`
  }

  if (eventType === EventType.PULL_REQUEST) {
    return `Found ${count} items to sync (single PR from event)`
  }

  const typeText = config.includePullRequests ? 'Issues and Pull Requests' : 'Issues'
  return `Found ${count} items to sync (${typeText} updated in last 24 hours)`
}