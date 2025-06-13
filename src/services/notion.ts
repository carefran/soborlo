import axios from 'axios'
import { markdownToBlocks } from '@tryfabric/martian'
import { GitHubItem, GitHubPullRequest } from '../types/github'
import { NotionPage, NotionPageData } from '../types/notion'

export async function findExistingNotionPage(
  itemId: number,
  notionToken: string,
  notionDatabaseId: string,
): Promise<NotionPage | null> {
  const response = await axios.post<{ results: NotionPage[] }>(
    `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
    {
      filter: {
        property: 'ID',
        number: {
          equals: itemId,
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
    },
  )

  return response.data.results.length > 0 ? response.data.results[0] : null
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
        number: item.id,
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
      } catch (error) {
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
      console.error('Notion API Error:', error.response.status, error.response.data)
      console.error('Request data:', JSON.stringify(pageData, null, 2))
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
    const response = await axios.patch<NotionPage>(
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

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error('Notion API Error (update):', error.response.status, error.response.data)
      console.error('Request data:', JSON.stringify(pageData, null, 2))
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
    await axios.patch(
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
    console.log(`Updated Notion page ${pageId} status to: ${statusName}`)
  } catch (error) {
    console.error('Error updating Notion page status:', error)
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
  
  return statusMap[githubStatus] || 'Not started'
} 