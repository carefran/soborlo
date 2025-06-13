import axios from 'axios'
import { markdownToBlocks } from '@tryfabric/martian'
import { GitHubItem, GitHubPullRequest } from '../types/github'
import { NotionPage, NotionPageData } from '../types/notion'
import { logger } from '../utils/logger'
import { retryWithBackoff } from '../utils/retry'

// Helper function to search Notion by a specific field
async function searchNotionByField(
  fieldName: string,
  fieldValue: any,
  notionToken: string,
  notionDatabaseId: string,
): Promise<NotionPage[]> {
  try {
    let filter: any
    
    if (typeof fieldValue === 'number') {
      filter = {
        property: fieldName,
        number: { equals: fieldValue },
      }
    } else if (typeof fieldValue === 'string') {
      filter = {
        property: fieldName,
        rich_text: { equals: fieldValue },
      }
    } else {
      return []
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
    logger.debug(`Search failed for ${fieldName}=${fieldValue}:`, error)
    return []
  }
}

// Helper function to verify and fix Notion page ID if needed
async function verifyAndFixNotionId(
  page: NotionPage,
  expectedId: string,
  notionToken: string,
): Promise<void> {
  try {
    const currentId = page.properties.ID?.rich_text?.[0]?.text?.content
    const pageNumber = page.properties.Number?.number
    const pageProduct = page.properties.Product?.select?.name
    const pageTitle = page.properties.Name?.title?.[0]?.text?.content
    
    logger.debug(`📋 Page details: ID=${currentId}, Number=${pageNumber}, Product=${pageProduct}, Title="${pageTitle}"`)
    
    if (currentId !== expectedId) {
      logger.info(`🔧 Correcting Notion page ID: ${currentId} → ${expectedId} (Page: "${pageTitle}")`)
      
      await axios.patch(
        `https://api.notion.com/v1/pages/${page.id}`,
        {
          properties: {
            ID: { 
              rich_text: [{ text: { content: expectedId } }]
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
      
      logger.info(`✅ Successfully corrected Notion page ID to ${expectedId}`)
    } else {
      logger.debug(`✅ Page ID ${currentId} is already correct`)
    }
  } catch (error) {
    logger.warn(`⚠️ Failed to correct Notion page ID: ${error}`)
  }
}

// Robust multi-criteria search for existing Notion pages
export async function findExistingNotionPage(
  item: GitHubItem,
  notionToken: string,
  notionDatabaseId: string,
): Promise<NotionPage | null> {
  logger.debug(`🔍 Searching for existing Notion page for GitHub item #${item.number} (ID: ${item.id})`)
  
  // Strategy 1: Search by GitHub ID
  logger.debug(`1️⃣ Searching by GitHub ID: ${item.id}`)
  let results = await searchNotionByField('ID', item.id, notionToken, notionDatabaseId)
  
  if (results.length > 0) {
    logger.info(`✅ Found page by GitHub ID: ${item.id}`)
    const page = results[0]
    await verifyAndFixNotionId(page, item.id, notionToken)
    return page
  }
  
  // Strategy 2: Search by Issue/PR Number
  logger.debug(`2️⃣ Searching by Number: ${item.number}`)
  results = await searchNotionByField('Number', item.number, notionToken, notionDatabaseId)
  
  if (results.length > 0) {
    logger.info(`✅ Found page by Number: ${item.number}, correcting ID`)
    const page = results[0]
    await verifyAndFixNotionId(page, item.id, notionToken)
    return page
  }
  
  // Strategy 3: Search by URL
  logger.debug(`3️⃣ Searching by URL: ${item.html_url}`)
  results = await searchNotionByField('URL', item.html_url, notionToken, notionDatabaseId)
  
  if (results.length > 0) {
    logger.info(`✅ Found page by URL: ${item.html_url}, correcting ID`)
    const page = results[0]
    await verifyAndFixNotionId(page, item.id, notionToken)
    return page
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
      ID: {
        rich_text: [
          {
            text: {
              content: item.id,
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

  // Add Product field if productName is provided
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
    
    // 更新後の実際のステータスを確認
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

// GitHub ProjectsとNotionのStatus名をマッピング
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
  
  // デバッグログを追加
  logger.debug(`🔄 Status mapping: "${githubStatus}" → "${mappedStatus}"`)
  if (mappedStatus === 'Not started') {
    logger.warn(`⚠️ Unmapped GitHub status: "${githubStatus}" - using default "Not started"`)
    logger.debug('Available mappings:', Object.keys(statusMap))
  }
  
  return mappedStatus
} 