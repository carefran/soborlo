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