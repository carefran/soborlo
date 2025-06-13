import { GitHubItem } from '../types/github'
import { RepositoryInfo, ActionConfig } from '../types/action'
import {
  findExistingNotionPage,
  createNotionPageData,
  createNotionPage,
  updateNotionPage,
  updateNotionPageStatus,
  mapGitHubStatusToNotion,
} from './notion'
import { getProjectStatus } from './github'
import { createSyncError } from '../utils/error-handler'

export async function processSingleItem(
  item: GitHubItem,
  repositoryInfo: RepositoryInfo,
  config: ActionConfig,
): Promise<void> {
  // const { repoName } = repositoryInfo // Currently unused
  const itemType = 'merged' in item ? 'Pull Request' : 'Issue'

  try {
    const existingPage = await findExistingNotionPage(
      item.id,
      config.notionToken,
      config.notionDatabaseId,
    )

    const pageData = createNotionPageData(
      item, 
      config.notionDatabaseId, 
      existingPage !== null,
      repositoryInfo.repoName,
    )

    if (existingPage) {
      await handleExistingPage(existingPage.id, pageData, item, repositoryInfo, config, itemType)
    } else {
      await handleNewPage(pageData, item, repositoryInfo, config, itemType)
    }

    console.log(`${itemType} #${item.number} synced successfully`)
  } catch (error) {
    const syncError = createSyncError(itemType, item.number, error)
    console.error(syncError.message, syncError.cause?.message || '')
    throw syncError
  }
}

async function handleExistingPage(
  pageId: string,
  pageData: ReturnType<typeof createNotionPageData>,
  item: GitHubItem,
  repositoryInfo: RepositoryInfo,
  config: ActionConfig,
  itemType: string,
): Promise<void> {
  console.log(`${itemType} #${item.number} already exists in Notion, updating it`)
  await updateNotionPage(pageId, pageData, config.notionToken)
  
  if (config.githubToken) {
    await syncProjectStatus(item, repositoryInfo, config, pageId, itemType)
  } else {
    console.log('GitHub token not provided, skipping Projects status sync')
  }
}

async function handleNewPage(
  pageData: ReturnType<typeof createNotionPageData>,
  item: GitHubItem,
  repositoryInfo: RepositoryInfo,
  config: ActionConfig,
  itemType: string,
): Promise<void> {
  console.log(`Creating new ${itemType} #${item.number} in Notion`)
  console.log('Page data properties:', Object.keys(pageData.properties))
  
  const newPage = await createNotionPage(pageData, config.notionToken)
  
  if (config.githubToken) {
    await syncProjectStatus(item, repositoryInfo, config, newPage.id, itemType)
  }
}

async function syncProjectStatus(
  item: GitHubItem,
  repositoryInfo: RepositoryInfo,
  config: ActionConfig,
  pageId: string,
  itemType: string,
): Promise<void> {
  console.log(`Checking GitHub Projects status for ${itemType} #${item.number}`)
  
  const githubStatus = await getProjectStatus(
    repositoryInfo.owner, 
    repositoryInfo.repoName, 
    item.number, 
    config.githubToken!,
    config.projectName,
  )
  
  if (githubStatus) {
    const notionStatus = mapGitHubStatusToNotion(githubStatus)
    console.log(`GitHub Projects status: ${githubStatus} → Notion status: ${notionStatus}`)
    await updateNotionPageStatus(pageId, notionStatus, config.notionToken)
  } else {
    console.log(`No GitHub Projects status found for ${itemType} #${item.number}`)
  }
}

export async function processAllItems(
  items: GitHubItem[],
  repositoryInfo: RepositoryInfo,
  config: ActionConfig,
): Promise<void> {
  for (const item of items) {
    await processSingleItem(item, repositoryInfo, config)
  }
}