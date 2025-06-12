import * as core from '@actions/core'
import * as github from '@actions/github'
import { getIssuesAndPullRequests, getProjectStatus, getProjectItems, getSingleIssue, getSinglePullRequest } from './services/github'
import {
  findExistingNotionPage,
  createNotionPageData,
  createNotionPage,
  updateNotionPage,
  updateNotionPageStatus,
  mapGitHubStatusToNotion
} from './services/notion'

async function main(): Promise<void> {
  try {
    const repo = core.getInput('repo')
    const notionToken = core.getInput('NOTION_API_KEY')
    const notionDatabaseId = core.getInput('NOTION_DATABASE_ID')
    const githubToken = core.getInput('PROJECT_TOKEN') || core.getInput('GITHUB_TOKEN')
    const includePullRequests = core.getInput('include_pull_requests').toLowerCase() === 'true'
    const projectName = core.getInput('project_name') || undefined

    console.log(`Syncing items from repository: ${repo}`)
    console.log(`Include Pull Requests: ${includePullRequests}`)
    if (projectName) {
      console.log(`Target Project: ${projectName}`)
    }

    // GitHub イベントタイプによって処理を分岐
    const eventName = process.env.GITHUB_EVENT_NAME
    const isScheduledOrManual = eventName === 'schedule' || eventName === 'workflow_dispatch'
    const isIssueEvent = eventName === 'issues'
    const isPullRequestEvent = eventName === 'pull_request'
    
    console.log(`Event type: ${eventName}`)
    
    // リポジトリ名を分解
    const [owner, repoName] = repo.split('/')
    
    // イベントタイプによって取得方法を分岐
    let items
    if (isScheduledOrManual) {
      console.log('Scheduled or manual execution: fetching items from GitHub Projects')
      items = await getProjectItems(owner, projectName, githubToken)
    } else if (isIssueEvent) {
      console.log('Issue event: processing single issue from context')
      const issueNumber = github.context.payload.issue?.number
      if (issueNumber) {
        const singleIssue = await getSingleIssue(owner, repoName, issueNumber, githubToken)
        items = singleIssue ? [singleIssue] : []
      } else {
        console.error('Issue number not found in context')
        items = []
      }
    } else if (isPullRequestEvent) {
      console.log('Pull Request event: processing single PR from context')
      const prNumber = github.context.payload.pull_request?.number
      if (prNumber) {
        const singlePR = await getSinglePullRequest(owner, repoName, prNumber, githubToken)
        items = singlePR ? [singlePR] : []
      } else {
        console.error('PR number not found in context')
        items = []
      }
    } else {
      console.log('Unknown event type: falling back to 24-hour filter')
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      items = await getIssuesAndPullRequests(repo, includePullRequests, githubToken, since)
    }
    
    console.log(`Found ${items.length} items to sync${isScheduledOrManual ? ' from GitHub Projects' : isIssueEvent ? ' (single issue from event)' : isPullRequestEvent ? ' (single PR from event)' : ` (Issues${includePullRequests ? ' and Pull Requests' : ''} updated in last 24 hours)`}`)

    for (const item of items) {
      try {
        const existingPage = await findExistingNotionPage(
          item.id,
          notionToken,
          notionDatabaseId
        )

        const pageData = createNotionPageData(item, notionDatabaseId, existingPage !== null)
        const itemType = 'merged' in item ? 'Pull Request' : 'Issue'

        if (existingPage) {
          console.log(`${itemType} #${item.number} already exists in Notion, updating it`)
          await updateNotionPage(existingPage.id, pageData, notionToken)
          
          // GitHub ProjectsのStatusを取得してNotionに反映
          if (githubToken) {
            console.log(`Checking GitHub Projects status for ${itemType} #${item.number}`)
            const githubStatus = await getProjectStatus(owner, repoName, item.number, githubToken, projectName)
            
            if (githubStatus) {
              const notionStatus = mapGitHubStatusToNotion(githubStatus)
              console.log(`GitHub Projects status: ${githubStatus} → Notion status: ${notionStatus}`)
              await updateNotionPageStatus(existingPage.id, notionStatus, notionToken)
            } else {
              console.log(`No GitHub Projects status found for ${itemType} #${item.number}`)
            }
          } else {
            console.log('GitHub token not provided, skipping Projects status sync')
          }
        } else {
          console.log(`Creating new ${itemType} #${item.number} in Notion`)
          console.log(`Page data properties:`, Object.keys(pageData.properties))
          const newPage = await createNotionPage(pageData, notionToken)
          
          // 新規作成時もGitHub ProjectsのStatusを確認
          if (githubToken) {
            console.log(`Checking GitHub Projects status for new ${itemType} #${item.number}`)
            const githubStatus = await getProjectStatus(owner, repoName, item.number, githubToken, projectName)
            
            if (githubStatus) {
              const notionStatus = mapGitHubStatusToNotion(githubStatus)
              console.log(`GitHub Projects status: ${githubStatus} → Notion status: ${notionStatus}`)
              await updateNotionPageStatus(newPage.id, notionStatus, notionToken)
            }
          }
        }

        console.log(`${itemType} #${item.number} synced successfully`)
      } catch (error) {
        const itemType = 'merged' in item ? 'Pull Request' : 'Issue'
        console.error(
          `Failed to sync ${itemType} ${item.number}:`,
          error instanceof Error ? error.message : String(error)
        )
      }
    }

    console.log('Sync completed successfully')
  } catch (error) {
    console.error('Error in main:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unhandled error:', error instanceof Error ? error.message : String(error))
  process.exit(1)
}) 