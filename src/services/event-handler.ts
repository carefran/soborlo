import * as github from '@actions/github'
import { EventType, EventContext } from '../types/action'
import { GitHubItem } from '../types/github'
import { getProjectItems, getSingleIssue, getSinglePullRequest } from './github'
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
  
  logger.info(`Event: ${eventName} | Issue: ${context.issueNumber || 'N/A'} | PR: ${context.pullRequestNumber || 'N/A'}`)
  logger.debug(`Repository: ${github.context.repo.owner}/${github.context.repo.repo}`)
  logger.debug(`Sender: ${github.context.payload.sender?.login || 'Unknown'}`)

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

  if (isScheduledOrManualEvent(eventType)) {
    logger.info('Fetching items from GitHub Projects')
    return await getProjectItems(owner, config.projectName, config.githubToken)
  }

  if (eventType === EventType.ISSUES) {
    if (!issueNumber) {
      logger.error('❌ Issue number not found in context')
      return []
    }
    
    const singleIssue = await getSingleIssue(owner, repoName, issueNumber, config.githubToken)
    
    if (singleIssue) {
      logger.info(`Processing issue #${issueNumber}: "${singleIssue.title}"`)
      return [singleIssue]
    } else {
      logger.error(`❌ Failed to fetch issue #${issueNumber}`)
      return []
    }
  }

  if (eventType === EventType.PULL_REQUEST) {
    if (!pullRequestNumber) {
      logger.error('❌ PR number not found in context')
      return []
    }
    
    const singlePR = await getSinglePullRequest(owner, repoName, pullRequestNumber, config.githubToken)
    
    if (singlePR) {
      logger.info(`Processing PR #${pullRequestNumber}: "${singlePR.title}"`)
      return [singlePR]
    } else {
      logger.error(`❌ Failed to fetch PR #${pullRequestNumber}`)
      return []
    }
  }

  // 設計外のイベントタイプの場合はエラー
  throw new Error(`Unsupported event type: ${eventContext.eventName}. Supported events: issues, pull_request, schedule, workflow_dispatch`)
}

export function getItemsSyncMessage(
  items: GitHubItem[], 
  eventContext: EventContext,
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

  // この時点では到達しないはずだが、型安全性のため
  return `Found ${count} items to sync (unknown event type)`
}