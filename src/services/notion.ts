import axios from 'axios'
import { markdownToBlocks } from '@tryfabric/martian'
import { GitHubItem, GitHubPullRequest } from '../types/github'
import { NotionPage, NotionPageData } from '../types/notion'

export async function findExistingNotionPage(
  itemId: number,
  notionToken: string,
  notionDatabaseId: string
): Promise<NotionPage | null> {
  const response = await axios.post<{ results: NotionPage[] }>(
    `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
    {
      filter: {
        property: 'ID',
        number: {
          equals: itemId
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    }
  )

  return response.data.results.length > 0 ? response.data.results[0] : null
}

function isPullRequest(item: GitHubItem): item is GitHubPullRequest {
  return 'merged' in item && 'draft' in item
}

export function createNotionPageData(
  item: GitHubItem,
  notionDatabaseId: string,
  isUpdate = false
): NotionPageData {
  const isPR = isPullRequest(item)
  
  const baseData: NotionPageData = {
    properties: {
      Name: {
        title: [
          {
            text: {
              content: item.title || (isPR ? 'Untitled Pull Request' : 'Untitled Issue')
            }
          }
        ]
      },
      ID: {
        number: item.id
      },
      Number: {
        number: item.number
      },
      State: {
        select: {
          name: item.state.charAt(0).toUpperCase() + item.state.slice(1) as 'Open' | 'Closed'
        }
      },
      Labels: {
        multi_select: (item.labels || []).map(label => ({
          name: label.name
        }))
      },
      URL: {
        url: item.html_url
      },
      Type: {
        select: {
          name: isPR ? 'Pull Request' : 'Issue'
        }
      }
    }
  }

  // 担当者とマイルストーンの追加
  if (item.assignees && item.assignees.length > 0) {
    baseData.properties.Assignees = {
      multi_select: item.assignees.map(assignee => ({
        name: assignee.login
      }))
    }
  }

  if (item.milestone) {
    baseData.properties.Milestone = {
      rich_text: [
        {
          text: {
            content: item.milestone.title
          }
        }
      ]
    }
  }

  // Pull Request専用プロパティの追加
  if (isPR) {
    baseData.properties.Draft = {
      checkbox: item.draft
    }
    baseData.properties.Merged = {
      checkbox: item.merged
    }
    baseData.properties['Base Branch'] = {
      rich_text: [
        {
          text: {
            content: item.base.ref
          }
        }
      ]
    }
    baseData.properties['Head Branch'] = {
      rich_text: [
        {
          text: {
            content: item.head.ref
          }
        }
      ]
    }
    baseData.properties.Additions = {
      number: item.additions
    }
    baseData.properties.Deletions = {
      number: item.deletions
    }
    baseData.properties['Changed Files'] = {
      number: item.changed_files
    }
  }

  if (!isUpdate) {
    baseData.parent = { database_id: notionDatabaseId }
    baseData.icon = { emoji: isPR ? '🔀' : '⚡' }
    baseData.properties.Status = {
      status: {
        name: 'Not started'
      }
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
                    content: item.body
                  }
                }
              ]
            }
          }
        ]
      }
    }
  }

  return baseData
}

export async function createNotionPage(
  pageData: NotionPageData,
  notionToken: string
): Promise<NotionPage> {
  const response = await axios.post<NotionPage>(
    'https://api.notion.com/v1/pages',
    pageData,
    {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      }
    }
  )

  return response.data
}

export async function updateNotionPage(
  pageId: string,
  pageData: NotionPageData,
  notionToken: string
): Promise<NotionPage> {
  const response = await axios.patch<NotionPage>(
    `https://api.notion.com/v1/pages/${pageId}`,
    pageData,
    {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      }
    }
  )

  return response.data
} 