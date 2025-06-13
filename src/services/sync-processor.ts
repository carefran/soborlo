import { GitHubItem } from '../types/github'
import { RepositoryInfo, ActionConfig } from '../types/action'
import {
  findExistingNotionPage,
  createNotionPageData,
  createNotionPage,
  updateNotionPage,
  updateNotionPageStatus,
  mapGitHubStatusToNotion,
  setNotionPageId,
} from './notion'
import { getProjectStatus } from './github'
import { createSyncError } from '../utils/error-handler'
import { logger } from '../utils/logger'

export async function processSingleItem(
  item: GitHubItem,
  repositoryInfo: RepositoryInfo,
  config: ActionConfig,
): Promise<void> {
  // const { repoName } = repositoryInfo // Currently unused
  const itemType = 'merged' in item ? 'Pull Request' : 'Issue'

  try {
    const existingPage = await findExistingNotionPage(
      item,
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

    logger.info(`${itemType} #${item.number} synced successfully`)
  } catch (error) {
    const syncError = createSyncError(itemType, item.number, error)
    logger.error(syncError.message, syncError.cause?.message ?? '')
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
  logger.info(`${itemType} #${item.number} already exists in Notion, updating it`)
  await updateNotionPage(pageId, pageData, config.notionToken)
  
  if (config.githubToken) {
    await syncProjectStatus(item, repositoryInfo, config, pageId, itemType)
  } else {
    logger.warn('GitHub token not provided, skipping Projects status sync')
  }
}

async function handleNewPage(
  pageData: ReturnType<typeof createNotionPageData>,
  item: GitHubItem,
  repositoryInfo: RepositoryInfo,
  config: ActionConfig,
  itemType: string,
): Promise<void> {
  logger.info(`Creating new ${itemType} #${item.number} in Notion`)
  logger.debug('Page data properties:', Object.keys(pageData.properties))
  
  const newPage = await createNotionPage(pageData, config.notionToken)
  
  logger.debug(`Setting GitHub ID ${item.id} for new page ${newPage.id}`)
  await setNotionPageId(newPage.id, item.id, config.notionToken)
  
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
  logger.debug(`🔍 Checking GitHub Projects status for ${itemType} #${item.number}`)
  
  if (!config.githubToken) {
    logger.warn('GitHub token not available for project status sync')
    return
  }
  
  try {
    const githubStatus = await getProjectStatus(
      repositoryInfo.owner, 
      repositoryInfo.repoName, 
      item.number, 
      config.githubToken,
      config.projectName,
    )
    
    if (githubStatus) {
      logger.info(`📋 Found GitHub Projects status: "${githubStatus}" for ${itemType} #${item.number}`)
      
      const notionStatus = mapGitHubStatusToNotion(githubStatus)
      logger.info(`🔄 GitHub Projects status: ${githubStatus} → Notion status: ${notionStatus}`)
      
      logger.debug(`📝 Updating Notion page ${pageId} with status: ${notionStatus}`)
      await updateNotionPageStatus(pageId, notionStatus, config.notionToken)
      
      logger.info(`✅ Status sync completed for ${itemType} #${item.number}`)
    } else {
      logger.debug(`❌ No GitHub Projects status found for ${itemType} #${item.number}`)
      logger.debug(`Repository: ${repositoryInfo.owner}/${repositoryInfo.repoName}, Project: ${config.projectName || 'auto-detect'}`)
    }
  } catch (error) {
    logger.error(`❌ Error during status sync for ${itemType} #${item.number}:`, error)
    throw error
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