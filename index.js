/** @format */

// Load the required modules
const core = require('@actions/core')
const axios = require('axios')
const { markdownToBlocks } = require('@tryfabric/martian')

async function main() {
  try {
    const repo = core.getInput('repo')
    const notionToken = core.getInput('NOTION_API_KEY')
    const notionDatabaseId = core.getInput('NOTION_DATABASE_ID')
    const githubToken = core.getInput('GITHUB_TOKEN')

    console.log(`Syncing issues from repository: ${repo}`)

    // Prepare headers for GitHub API
    const githubHeaders = {
      'User-Agent': 'github-issue-2-notion',
    }

    // Add authorization header if GitHub token is provided
    if (githubToken) {
      githubHeaders.Authorization = `Bearer ${githubToken}`
      console.log('Using GitHub token for authentication')
    }

    // Get all issues from the repository
    const issuesUrl = `https://api.github.com/repos/${repo}/issues?state=all`

    try {
      const issuesResponse = await axios.get(issuesUrl, {
        headers: githubHeaders,
      })

      const issues = issuesResponse.data
      console.log(`Found ${issues.length} issues to sync`)

      for (const issue of issues) {
        try {
          await syncIssueToNotion(issue, notionToken, notionDatabaseId)
        } catch (error) {
          console.error(`Failed to sync issue ${issue.number}:`, error.message)
          // Continue with other issues even if one fails
        }
      }

      console.log('Sync completed successfully')
    } catch (error) {
      if (error.response?.status === 404) {
        console.error(`Repository '${repo}' not found. Please check:`)
        console.error('1. The repository name is correct (format: owner/repo)')
        console.error('2. The repository exists and is accessible')
        if (!githubToken) {
          console.error(
            '3. If it\'s a private repository, provide GITHUB_TOKEN',
          )
        }
      } else if (error.response?.status === 403) {
        console.error('GitHub API rate limit exceeded or access forbidden')
        if (!githubToken) {
          console.error(
            'Consider providing GITHUB_TOKEN for higher rate limits',
          )
        }
      } else {
        console.error('Failed to fetch issues:', error.message)
      }
      throw error
    }
  } catch (error) {
    console.error('Main process failed:', error.message)
    process.exit(1)
  }
}

async function syncIssueToNotion(issue, notionToken, notionDatabaseId) {
  const issueId = issue.id
  const issueNumber = issue.number

  // Check if the issue already exists in Notion
  const existingPage = await findExistingNotionPage(
    issueId,
    notionToken,
    notionDatabaseId,
  )

  // Prepare the page data
  const pageData = createNotionPageData(
    issue,
    notionDatabaseId,
    existingPage !== null,
  )

  if (existingPage) {
    console.log(`Issue #${issueNumber} already exists in Notion, updating it`)
    await updateNotionPage(existingPage.id, pageData, notionToken)
  } else {
    console.log(`Creating new issue #${issueNumber} in Notion`)
    await createNotionPage(pageData, notionToken)
  }

  console.log(`Issue #${issueNumber} synced successfully`)
}

async function findExistingNotionPage(issueId, notionToken, notionDatabaseId) {
  try {
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
      {
        filter: {
          property: 'ID',
          number: {
            equals: issueId,
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
  } catch (error) {
    console.error('Error finding existing Notion page:', error.message)
    throw error
  }
}

function createNotionPageData(issue, notionDatabaseId, isUpdate = false) {
  const baseData = {
    properties: {
      Name: {
        title: [
          {
            text: {
              content: issue.title || 'Untitled Issue',
            },
          },
        ],
      },
      ID: {
        number: issue.id,
      },
      Number: {
        number: issue.number,
      },
      State: {
        select: {
          name: issue.state.charAt(0).toUpperCase() + issue.state.slice(1),
        },
      },
      Labels: {
        multi_select: (issue.labels || []).map((label) => ({
          name: label.name,
        })),
      },
      URL: {
        url: issue.html_url,
      },
    },
  }

  // Add Status property only for new issues
  if (!isUpdate) {
    baseData.parent = { database_id: notionDatabaseId }
    baseData.icon = {
      emoji: '⚡',
    }
    baseData.properties.Status = {
      status: {
        name: 'Not started',
      },
    }
    // Add issue body as children blocks
    if (issue.body) {
      try {
        baseData.children = markdownToBlocks(issue.body)
      } catch (error) {
        console.warn('Failed to convert markdown to blocks:', error.message)
        baseData.children = [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: issue.body,
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

async function createNotionPage(pageData, notionToken) {
  try {
    const response = await axios.post(
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
    console.error(
      'Error creating Notion page:',
      error.response?.data || error.message,
    )
    throw error
  }
}

async function updateNotionPage(pageId, pageData, notionToken) {
  try {
    const response = await axios.patch(
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
    console.error(
      'Error updating Notion page:',
      error.response?.data || error.message,
    )
    throw error
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
