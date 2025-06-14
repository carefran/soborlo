import * as core from '@actions/core'
import axios from 'axios'
import dotenv from 'dotenv'
import { getProjectStatus, getIssuesAndPullRequests } from './services/github'
import { updateNotionPageStatus, mapGitHubStatusToNotion } from './services/notion'
import { GitHubItem } from './types/github'
import { getErrorMessage } from './utils/error-handler'
import { logger } from './utils/logger'

// .envファイルを読み込み
dotenv.config()

interface NotionPageWithDetails {
  id: string
  properties: {
    Name: {
      title: Array<{
        text: {
          content: string
        }
      }>
    }
    Number?: {
      number: number
    }
    ID?: {
      number: number
    }
    Status?: {
      status: {
        name: string
      }
    }
    [key: string]: any
  }
}

interface MatchResult {
  notionPage: NotionPageWithDetails
  githubIssue: GitHubItem | null
  matchType: 'pbi-id' | 'title' | 'none'
  matchedBy?: string
}

async function getNotionPagesForReverseSync(
  notionToken: string,
  notionDatabaseId: string
): Promise<NotionPageWithDetails[]> {
  const response = await axios.post<{ results: NotionPageWithDetails[] }>(
    `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
    {
      filter: {
        and: [
          {
            property: 'Status',
            status: {
              does_not_equal: 'Not started'
            }
          },
          {
            property: 'Status',
            status: {
              does_not_equal: '完了'
            }
          },
          {
            property: 'Status',
            status: {
              does_not_equal: '無効'
            }
          }
        ]
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

  return response.data.results
}

function extractPbiId(title: string): string | null {
  const match = title.match(/^PBI-(\d+):/i)
  return match ? match[1] : null
}

function normalizeTitle(title: string): string {
  return title.replace(/^PBI-\d+:\s*/i, '').trim().toLowerCase()
}

function matchByTitle(notionTitle: string, githubIssues: GitHubItem[]): GitHubItem | null {
  const normalizedNotionTitle = normalizeTitle(notionTitle)
  
  return githubIssues.find(issue => {
    const normalizedGithubTitle = normalizeTitle(issue.title)
    return normalizedGithubTitle === normalizedNotionTitle
  }) || null
}

async function matchNotionWithGitHub(
  notionPages: NotionPageWithDetails[],
  githubIssues: GitHubItem[]
): Promise<MatchResult[]> {
  const results: MatchResult[] = []

  for (const notionPage of notionPages) {
    const notionTitle = notionPage.properties.Name?.title?.[0]?.text?.content || ''
    const pbiId = extractPbiId(notionTitle)
    let matchResult: MatchResult = {
      notionPage,
      githubIssue: null,
      matchType: 'none'
    }

    if (pbiId) {
      const matchedIssue = githubIssues.find(issue => {
        const issuePbiId = extractPbiId(issue.title)
        return issuePbiId === pbiId
      })

      if (matchedIssue) {
        matchResult = {
          notionPage,
          githubIssue: matchedIssue,
          matchType: 'pbi-id',
          matchedBy: `PBI-${pbiId}`
        }
      }
    }

    if (!matchResult.githubIssue) {
      const matchedIssue = matchByTitle(notionTitle, githubIssues)
      if (matchedIssue) {
        matchResult = {
          notionPage,
          githubIssue: matchedIssue,
          matchType: 'title',
          matchedBy: normalizeTitle(notionTitle)
        }
      }
    }

    results.push(matchResult)
  }

  return results
}

async function reverseSyncNotionToGitHub(dryRun: boolean = false): Promise<void> {
  try {
    const repo = core.getInput('repo') || process.env.GITHUB_REPOSITORY
    const notionToken = core.getInput('NOTION_API_KEY') || process.env.NOTION_API_KEY
    const notionDatabaseId = core.getInput('NOTION_DATABASE_ID') || process.env.NOTION_DATABASE_ID
    const githubToken = core.getInput('PROJECT_TOKEN') || core.getInput('GITHUB_TOKEN') || process.env.PROJECT_TOKEN || process.env.GITHUB_TOKEN

    if (!repo || !notionToken || !notionDatabaseId || !githubToken) {
      logger.error('Missing required environment variables')
      process.exit(1)
    }

    if (dryRun) {
      logger.info(`🧪 DRY RUN MODE - No actual changes will be made`)
    }
    logger.info(`Starting reverse sync for repository: ${repo}`)
    logger.info(`🎯 Goal: Sync Notion pages (except "Not started", "完了", and "無効") with GitHub Projects status`)

    const notionPages = await getNotionPagesForReverseSync(notionToken, notionDatabaseId)
    logger.info(`Found ${notionPages.length} Notion pages to sync (excluding "Not started", "完了", and "無効")`)

    const githubIssues = await getIssuesAndPullRequests(repo, false, githubToken)
    logger.info(`Found ${githubIssues.length} GitHub issues`)

    const matchResults = await matchNotionWithGitHub(notionPages, githubIssues)

    const [owner, repoName] = repo.split('/')

    let matchedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    const unmatchedPages: NotionPageWithDetails[] = []

    logger.info('\n🔍 Processing matches...')

    for (const result of matchResults) {
      if (result.githubIssue) {
        matchedCount++
        logger.info(`\n✅ Matched: "${result.notionPage.properties.Name?.title?.[0]?.text?.content}"`)
        logger.info(`   → GitHub Issue #${result.githubIssue.number} (${result.matchType}: ${result.matchedBy})`)

        try {
          const githubStatus = await getProjectStatus(owner, repoName, result.githubIssue.number, githubToken)
          const currentNotionStatus = result.notionPage.properties.Status?.status?.name

          if (githubStatus) {
            const targetNotionStatus = mapGitHubStatusToNotion(githubStatus)
            
            if (currentNotionStatus !== targetNotionStatus) {
              if (dryRun) {
                logger.info(`   🧪 [DRY RUN] Would update status: "${currentNotionStatus}" → "${targetNotionStatus}" (from GitHub Projects: "${githubStatus}")`)
              } else {
                logger.info(`   📝 Status sync: "${currentNotionStatus}" → "${targetNotionStatus}" (from GitHub Projects: "${githubStatus}")`)
                await updateNotionPageStatus(result.notionPage.id, targetNotionStatus, notionToken)
              }
              updatedCount++
            } else {
              logger.info(`   ✓ Status already synced: "${currentNotionStatus}"`)
              skippedCount++
            }
          } else {
            logger.warn(`   ⚠️ No GitHub Projects status found - keeping current Notion status: "${currentNotionStatus}"`)
            skippedCount++
          }
        } catch (error) {
          logger.error(`   ❌ Error syncing status: ${getErrorMessage(error)}`)
          skippedCount++
        }

        await new Promise(resolve => setTimeout(resolve, 100))
      } else {
        unmatchedPages.push(result.notionPage)
      }
    }

    logger.info(`\n📊 Reverse Sync Summary ${dryRun ? '(DRY RUN)' : ''}:`)
    logger.info(`- Total Notion pages processed: ${notionPages.length}`)
    logger.info(`- Matched with GitHub issues: ${matchedCount}`)
    logger.info(`- Status ${dryRun ? 'would be ' : ''}updated: ${updatedCount}`)
    logger.info(`- Status already synced: ${skippedCount}`)
    logger.info(`- Unmatched pages: ${unmatchedPages.length}`)

    if (unmatchedPages.length > 0) {
      logger.warn('\n❌ Unmatched Notion Pages (no corresponding GitHub issue found):')
      unmatchedPages.forEach((page, index) => {
        const title = page.properties.Name?.title?.[0]?.text?.content || 'Untitled'
        const status = page.properties.Status?.status?.name || 'Unknown'
        logger.warn(`${index + 1}. "${title}" (Status: ${status})`)
      })
    }

    logger.info(`\n✨ Reverse sync ${dryRun ? 'dry run ' : ''}completed successfully`)
  } catch (error) {
    logger.error('Error in reverse sync:', getErrorMessage(error))
    process.exit(1)
  }
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d')
  
  reverseSyncNotionToGitHub(isDryRun).catch(error => {
    logger.error('Unhandled error:', getErrorMessage(error))
    process.exit(1)
  })
}

export { reverseSyncNotionToGitHub }