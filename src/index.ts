import * as core from '@actions/core'
import { getIssuesAndPullRequests } from './services/github'
import {
  findExistingNotionPage,
  createNotionPageData,
  createNotionPage,
  updateNotionPage
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
        } else {
          console.log(`Creating new ${itemType} #${item.number} in Notion`)
          await createNotionPage(pageData, notionToken)
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
    console.error('Main process failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unhandled error:', error instanceof Error ? error.message : String(error))
  process.exit(1)
}) 