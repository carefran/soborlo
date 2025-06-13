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
  
  logger.debug('📋 GitHub Event Context:')
  logger.debug(`   Event Name: ${eventName}`)
  logger.debug(`   Event Type: ${eventType || 'Unknown'}`)
  logger.debug(`   Issue Number: ${context.issueNumber || 'Not available'}`)
  logger.debug(`   PR Number: ${context.pullRequestNumber || 'Not available'}`)
  
  if (github.context.payload.issue) {
    logger.debug(`   Issue Action: ${github.context.payload.action || 'Unknown'}`)
    logger.debug(`   Issue Title: "${github.context.payload.issue.title || 'Unknown'}"`)
    logger.debug(`   Issue State: ${github.context.payload.issue.state || 'Unknown'}`)
  }
  
  if (github.context.payload.pull_request) {
    logger.debug(`   PR Action: ${github.context.payload.action || 'Unknown'}`)
    logger.debug(`   PR Title: "${github.context.payload.pull_request.title || 'Unknown'}"`)
    logger.debug(`   PR State: ${github.context.payload.pull_request.state || 'Unknown'}`)
  }
  
  logger.debug(`   Repository: ${github.context.repo.owner}/${github.context.repo.repo}`)
  logger.debug(`   Sender: ${github.context.payload.sender?.login || 'Unknown'}`)

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
    logger.info(`Issue event: processing issue #${issueNumber}`)
    logger.debug(`📁 Repository: ${owner}/${repoName}`)
    logger.debug(`🎯 Target project: ${config.projectName || 'auto-detect'}`)
    logger.debug(`🔑 GitHub token available: ${config.githubToken ? 'Yes' : 'No'}`)
    
    if (!issueNumber) {
      logger.error('❌ Issue number not found in context')
      return []
    }
    
    const singleIssue = await getSingleIssue(owner, repoName, issueNumber, config.githubToken)
    
    if (singleIssue) {
      logger.info(`✅ Successfully fetched issue #${issueNumber}: "${singleIssue.title}"`)
      logger.debug(`   State: ${singleIssue.state}`)
      logger.debug(`   Labels: ${singleIssue.labels?.map(l => l.name).join(', ') || 'None'}`)
      logger.debug(`   URL: ${singleIssue.html_url}`)
      return [singleIssue]
    } else {
      logger.error(`❌ Failed to fetch issue #${issueNumber}`)
      return []
    }
  }

  if (eventType === EventType.PULL_REQUEST) {
    logger.info(`Pull Request event: processing PR #${pullRequestNumber}`)
    logger.debug(`📁 Repository: ${owner}/${repoName}`)
    
    if (!pullRequestNumber) {
      logger.error('❌ PR number not found in context')
      return []
    }
    
    const singlePR = await getSinglePullRequest(owner, repoName, pullRequestNumber, config.githubToken)
    
    if (singlePR) {
      logger.info(`✅ Successfully fetched PR #${pullRequestNumber}: "${singlePR.title}"`)
      logger.debug(`   State: ${singlePR.state}`)
      return [singlePR]
    } else {
      logger.error(`❌ Failed to fetch PR #${pullRequestNumber}`)
      return []
    }
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