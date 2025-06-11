import * as core from '@actions/core'
import { getIssuesAndPullRequests, getProjectStatus } from './services/github'
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
    const githubToken = core.getInput('GITHUB_TOKEN')
    const includePullRequests = core.getInput('include_pull_requests').toLowerCase() === 'true'

    console.log(`Syncing items from repository: ${repo}`)
    console.log(`Include Pull Requests: ${includePullRequests}`)

    const items = await getIssuesAndPullRequests(repo, includePullRequests, githubToken)
    console.log(`Found ${items.length} items to sync (Issues${includePullRequests ? ' and Pull Requests' : ''})`)

    // リポジトリ名を分解
    const [owner, repoName] = repo.split('/')

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
            const githubStatus = await getProjectStatus(owner, repoName, item.number, githubToken)
            
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
          const newPage = await createNotionPage(pageData, notionToken)
          
          // 新規作成時もGitHub ProjectsのStatusを確認
          if (githubToken) {
            console.log(`Checking GitHub Projects status for new ${itemType} #${item.number}`)
            const githubStatus = await getProjectStatus(owner, repoName, item.number, githubToken)
            
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