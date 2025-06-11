import * as core from '@actions/core'
import axios from 'axios'
import dotenv from 'dotenv'
import { getProjectStatus, getIssues } from './services/github'
import { updateNotionPageStatus, mapGitHubStatusToNotion } from './services/notion'
import { NotionPage } from './types/notion'
import { GitHubIssue } from './types/github'

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
  githubIssue: GitHubIssue | null
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
  // PBI-ID部分を除去して正規化
  return title.replace(/^PBI-\d+:\s*/i, '').trim().toLowerCase()
}

function matchByTitle(notionTitle: string, githubIssues: GitHubIssue[]): GitHubIssue | null {
  const normalizedNotionTitle = normalizeTitle(notionTitle)
  
  return githubIssues.find(issue => {
    const normalizedGithubTitle = normalizeTitle(issue.title)
    return normalizedGithubTitle === normalizedNotionTitle
  }) || null
}

async function matchNotionWithGitHub(
  notionPages: NotionPageWithDetails[],
  githubIssues: GitHubIssue[]
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
      // PBI-IDでマッチング
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
      // タイトルでマッチング
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
      console.error('Missing required environment variables')
      process.exit(1)
    }

    if (dryRun) {
      console.log(`🧪 DRY RUN MODE - No actual changes will be made`)
    }
    console.log(`Starting reverse sync for repository: ${repo}`)
    console.log(`🎯 Goal: Sync Notion pages (except "Not started", "完了", and "無効") with GitHub Projects status`)

    // NotionからNot Started・完了・無効以外のページを取得
    const notionPages = await getNotionPagesForReverseSync(notionToken, notionDatabaseId)
    console.log(`Found ${notionPages.length} Notion pages to sync (excluding "Not started", "完了", and "無効")`)

    // GitHub Issuesを取得
    const githubIssues = await getIssues(repo, githubToken)
    console.log(`Found ${githubIssues.length} GitHub issues`)

    // マッチング実行
    const matchResults = await matchNotionWithGitHub(notionPages, githubIssues)

    // リポジトリ名を分解
    const [owner, repoName] = repo.split('/')

    let matchedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    const unmatchedPages: NotionPageWithDetails[] = []

    console.log('\n🔍 Processing matches...')

    for (const result of matchResults) {
      if (result.githubIssue) {
        matchedCount++
        console.log(`\n✅ Matched: "${result.notionPage.properties.Name?.title?.[0]?.text?.content}"`)
        console.log(`   → GitHub Issue #${result.githubIssue.number} (${result.matchType}: ${result.matchedBy})`)

        try {
          // GitHub Projectsのステータスを取得
          const githubStatus = await getProjectStatus(owner, repoName, result.githubIssue.number, githubToken)
          const currentNotionStatus = result.notionPage.properties.Status?.status?.name

          if (githubStatus) {
            const targetNotionStatus = mapGitHubStatusToNotion(githubStatus)
            
            if (currentNotionStatus !== targetNotionStatus) {
              if (dryRun) {
                console.log(`   🧪 [DRY RUN] Would update status: "${currentNotionStatus}" → "${targetNotionStatus}" (from GitHub Projects: "${githubStatus}")`)
              } else {
                console.log(`   📝 Status sync: "${currentNotionStatus}" → "${targetNotionStatus}" (from GitHub Projects: "${githubStatus}")`)
                await updateNotionPageStatus(result.notionPage.id, targetNotionStatus, notionToken)
              }
              updatedCount++
            } else {
              console.log(`   ✓ Status already synced: "${currentNotionStatus}"`)
              skippedCount++
            }
          } else {
            console.log(`   ⚠️ No GitHub Projects status found - keeping current Notion status: "${currentNotionStatus}"`)
            skippedCount++
          }
        } catch (error) {
          console.error(`   ❌ Error syncing status: ${error instanceof Error ? error.message : String(error)}`)
          skippedCount++
        }

        // API制限を避けるために少し待機
        await new Promise(resolve => setTimeout(resolve, 100))
      } else {
        unmatchedPages.push(result.notionPage)
      }
    }

    console.log(`\n📊 Reverse Sync Summary ${dryRun ? '(DRY RUN)' : ''}:`)
    console.log(`- Total Notion pages processed: ${notionPages.length}`)
    console.log(`- Matched with GitHub issues: ${matchedCount}`)
    console.log(`- Status ${dryRun ? 'would be ' : ''}updated: ${updatedCount}`)
    console.log(`- Status already synced: ${skippedCount}`)
    console.log(`- Unmatched pages: ${unmatchedPages.length}`)

    if (unmatchedPages.length > 0) {
      console.log('\n❌ Unmatched Notion Pages (no corresponding GitHub issue found):')
      unmatchedPages.forEach((page, index) => {
        const title = page.properties.Name?.title?.[0]?.text?.content || 'Untitled'
        const status = page.properties.Status?.status?.name || 'Unknown'
        console.log(`${index + 1}. "${title}" (Status: ${status})`)
      })
    }

    console.log(`\n✨ Reverse sync ${dryRun ? 'dry run ' : ''}completed successfully`)
  } catch (error) {
    console.error('Error in reverse sync:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// スクリプトが直接実行された場合
if (require.main === module) {
  // コマンドライン引数をチェック
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d')
  
  reverseSyncNotionToGitHub(isDryRun).catch(error => {
    console.error('Unhandled error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

export { reverseSyncNotionToGitHub }