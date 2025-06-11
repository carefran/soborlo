import axios from 'axios'
import { GitHubIssue, GitHubPullRequest, GitHubItem } from '../types/github'

export async function getIssues(repo: string, githubToken?: string): Promise<GitHubIssue[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion'
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  const response = await axios.get<GitHubIssue[]>(
    `https://api.github.com/repos/${repo}/issues?state=all`,
    { headers }
  )

  // Pull Requestを除外（GitHub APIではPRもissuesに含まれる）
  return response.data.filter(issue => !('pull_request' in issue))
}

export async function getPullRequests(repo: string, githubToken?: string): Promise<GitHubPullRequest[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion'
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  const response = await axios.get<GitHubPullRequest[]>(
    `https://api.github.com/repos/${repo}/pulls?state=all`,
    { headers }
  )

  return response.data
}

export async function getIssuesAndPullRequests(
  repo: string,
  includePullRequests: boolean,
  githubToken?: string
): Promise<GitHubItem[]> {
  const items: GitHubItem[] = []

  // 常にIssueを取得
  const issues = await getIssues(repo, githubToken)
  items.push(...issues)

  // オプションでPull Requestを取得
  if (includePullRequests) {
    const pullRequests = await getPullRequests(repo, githubToken)
    items.push(...pullRequests)
  }

  return items
}

export async function getProjectStatus(
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken: string
): Promise<string | null> {
  const query = `
    query($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          projectItems(first: 10) {
            nodes {
              project {
                title
              }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    console.log(`Fetching project status for ${owner}/${repo}#${issueNumber}`)
    
    const response = await axios.post<{
      data: {
        repository: {
          issue: {
            projectItems: {
              nodes: Array<{
                project: { title: string }
                fieldValueByName: { name: string } | null
              }>
            }
          }
        }
      }
      errors?: Array<{ message: string }>
    }>(
      'https://api.github.com/graphql',
      {
        query,
        variables: { owner, repo, issueNumber }
      },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    // GraphQLエラーをチェック
    if (response.data.errors) {
      console.error('GraphQL errors:', response.data.errors)
      return null
    }

    // レスポンス全体をログ出力
    console.log(`GraphQL response for issue #${issueNumber}:`, JSON.stringify(response.data, null, 2))

    const repository = response.data.data?.repository
    if (!repository?.issue?.projectItems?.nodes) {
      return null
    }

    const projectItems = repository.issue.projectItems.nodes
    
    // 利用可能なプロジェクトをログ出力
    console.log(`Available projects for issue #${issueNumber}:`, 
      projectItems.map(item => ({ 
        project: item.project?.title, 
        status: item.fieldValueByName?.name 
      }))
    )
    
    // "Troika"プロジェクトのStatusを取得
    const troikaItem = projectItems.find(item => item.project?.title === 'Troika')
    return troikaItem?.fieldValueByName?.name || null
  } catch (error) {
    console.error('Error fetching project status:', error)
    return null
  }
}

export async function getIssueState(
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken?: string
): Promise<string | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion'
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  try {
    const response = await axios.get<{ state: string }>(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      { headers }
    )
    return response.data.state
  } catch (error) {
    console.error(`Error fetching issue state for #${issueNumber}:`, error)
    return null
  }
}

export async function getPullRequestDetails(
  owner: string,
  repo: string,
  prNumber: number,
  githubToken?: string
): Promise<{ state: string; merged: boolean; draft: boolean } | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion'
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  try {
    const response = await axios.get<{ 
      state: string;
      merged: boolean;
      draft: boolean;
    }>(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers }
    )
    return {
      state: response.data.state,
      merged: response.data.merged,
      draft: response.data.draft
    }
  } catch (error) {
    console.error(`Error fetching PR details for #${prNumber}:`, error)
    return null
  }
}

export async function updateProjectStatus(
  owner: string,
  repo: string,
  issueNumber: number,
  statusName: string,
  githubToken: string
): Promise<boolean> {
  // GitHub Projects v2 APIでのStatus更新実装
  // 注: 実装には追加のGraphQL操作が必要
  console.log(`Would update ${owner}/${repo}#${issueNumber} to status: ${statusName}`)
  return true
} 