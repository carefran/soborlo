import axios from 'axios'
import { markdownToBlocks } from '@tryfabric/martian'
import { GitHubItem, GitHubPullRequest } from '../types/github'
import { NotionPage, NotionPageData } from '../types/notion'
import { logger } from '../utils/logger'
import { retryWithBackoff } from '../utils/retry'

// Robust multi-criteria search for existing Notion pages
async function searchNotionById(
  githubId: string,
  notionToken: string,
  notionDatabaseId: string,
): Promise<NotionPage[]> {
  try {
    const filter = {
      property: 'ID',
      rich_text: { equals: githubId },
    }

    const response = await axios.post<{ results: NotionPage[] }>(
      `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
      { filter },
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
      },
    )

    return response.data.results
  } catch (error) {
    logger.debug(`Search failed for ID=${githubId}:`, error)
    return []
  }
}

export async function findExistingNotionPage(
  item: GitHubItem,
  notionToken: string,
  notionDatabaseId: string,
): Promise<NotionPage | null> {
  logger.debug(`🔍 Searching for existing Notion page for GitHub item #${item.number} (ID: ${item.id})`)
  
  const results = await searchNotionById(item.id, notionToken, notionDatabaseId)
  
  if (results.length > 0) {
    logger.info(`✅ Found page by GitHub ID: ${item.id}`)
    return results[0]
  }
  
  logger.debug(`❌ No existing Notion page found for GitHub item #${item.number}`)
  return null
}

function isPullRequest(item: GitHubItem): item is GitHubPullRequest {
  return 'merged' in item && 'draft' in item
}

export function createNotionPageData(
  item: GitHubItem,
  notionDatabaseId: string,
  isUpdate = false,
  productName?: string,
): NotionPageData {
  const isPR = isPullRequest(item)
  
  const baseData: NotionPageData = {
    properties: {
      Name: {
        title: [
          {
            text: {
              content: item.title || (isPR ? 'Untitled Pull Request' : 'Untitled Issue'),
            },
          },
        ],
      },
      Number: {
        number: item.number,
      },
      State: {
        select: {
          name: item.state.charAt(0).toUpperCase() + item.state.slice(1) as 'Open' | 'Closed',
        },
      },
      Labels: {
        multi_select: (item.labels || []).map(label => ({
          name: label.name,
        })),
      },
      URL: {
        url: item.html_url,
      },
      Type: {
        select: {
          name: isPR ? 'Pull Request' : 'Issue',
        },
      },
    },
  }

  if (productName) {
    baseData.properties.Product = {
      select: {
        name: productName,
      },
    }
  }

  if (!isUpdate) {
    baseData.parent = { database_id: notionDatabaseId }
    baseData.icon = { emoji: isPR ? '🔀' : '⚡' }
    baseData.properties.Status = {
      status: {
        name: 'Not started',
      },
    }

    if (item.body) {
      try {
        baseData.children = markdownToBlocks(item.body)
      } catch {
        // markdownToBlocksが失敗した場合のフォールバック: 生テキストとして表示
        baseData.children = [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: item.body,
                  },
                },
              ],
            },
          },
        ]
      }
    }
  }

  return baseData
}

// ページ作成時はIDプロパティを含められないため、作成後に別途設定する
export async function setNotionPageId(
  pageId: string,
  githubId: string,
  notionToken: string,
): Promise<void> {
  try {
    await axios.patch(
      `https://api.notion.com/v1/pages/${pageId}`,
      {
        properties: {
          ID: { 
            rich_text: [{ text: { content: githubId } }]
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
      },
    )
    logger.debug(`✅ Successfully set ID as rich_text: ${githubId}`)
  } catch (error: any) {
    logger.error(`❌ Failed to set ID field for page ${pageId} with value ${githubId}:`, error.response?.data?.message || error.message)
    throw error
  }
}

export async function createNotionPage(
  pageData: NotionPageData,
  notionToken: string,
): Promise<NotionPage> {
  try {
    const response = await axios.post<NotionPage>(
      'https://api.notion.com/v1/pages',
      pageData,
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
      },
    )

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      logger.error('Notion API Error:', error.response.status, error.response.data)
      logger.debug('Request data:', JSON.stringify(pageData, null, 2))
    }
    throw error
  }
}

export async function updateNotionPage(
  pageId: string,
  pageData: NotionPageData,
  notionToken: string,
): Promise<NotionPage> {
  try {
    const response = await retryWithBackoff(async () => {
      return await axios.patch<NotionPage>(
        `https://api.notion.com/v1/pages/${pageId}`,
        pageData,
        {
          headers: {
            Authorization: `Bearer ${notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
        },
      )
    })

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      logger.error('Notion API Error (update):', error.response.status, error.response.data)
      logger.debug('Request data:', JSON.stringify(pageData, null, 2))
    }
    throw error
  }
}

export async function updateNotionPageStatus(
  pageId: string,
  statusName: string,
  notionToken: string,
): Promise<void> {
  try {
    logger.debug(`Attempting to update Notion page ${pageId} status to: ${statusName}`)
    
    const response = await retryWithBackoff(async () => {
      return await axios.patch(
        `https://api.notion.com/v1/pages/${pageId}`,
        {
          properties: {
            Status: {
              status: {
                name: statusName,
              },
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
        },
      )
    })
    
    logger.info(`✅ Successfully updated Notion page ${pageId} status to: ${statusName}`)
    logger.debug(`API Response Status: ${response.status}`)
    
    // Notionのステータス更新は非同期のため、設定値と実際の値に差異がある場合がある
    if (response.data.properties?.Status?.status?.name) {
      const actualStatus = response.data.properties.Status.status.name
      if (actualStatus !== statusName) {
        logger.warn(`⚠️ Status mismatch! Expected: ${statusName}, Actual: ${actualStatus}`)
      } else {
        logger.debug(`✅ Status confirmed: ${actualStatus}`)
      }
    }
    
  } catch (error) {
    logger.error('❌ Error updating Notion page status:', error)
    
    if (axios.isAxiosError(error) && error.response) {
      logger.error('API Error Details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      })
    }
    
    throw error
  }
}

// プロジェクト固有のステータス名をNotionデータベースのステータス名にマッピング
export function mapGitHubStatusToNotion(githubStatus: string): string {
  const statusMap: Record<string, string> = {
    'お手すきに': 'お手すきに',
    'Backlog': 'Backlog', 
    '今週やる': '今週やる',
    '着手中': '着手中',
    '相談中': '相談中',
    '完了': '完了',
  }
  
  const mappedStatus = statusMap[githubStatus] || 'Not started'
  
  logger.debug(`🔄 Status mapping: "${githubStatus}" → "${mappedStatus}"`)
  if (mappedStatus === 'Not started') {
    logger.warn(`⚠️ Unmapped GitHub status: "${githubStatus}" - using default "Not started"`)
    logger.debug('Available mappings:', Object.keys(statusMap))
  }
  
  return mappedStatus
} 