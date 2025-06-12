import axios from 'axios'
import { GitHubIssue, GitHubPullRequest, GitHubItem } from '../types/github'

export async function getIssues(repo: string, githubToken?: string, since?: string): Promise<GitHubIssue[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion'
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  let allIssues: GitHubIssue[] = []
  let page = 1
  const perPage = 100

  // since パラメータの構築
  const sinceParam = since ? `&since=${encodeURIComponent(since)}` : ''

  while (true) {
    const response = await axios.get<GitHubIssue[]>(
      `https://api.github.com/repos/${repo}/issues?state=all&page=${page}&per_page=${perPage}${sinceParam}`,
      { headers }
    )

    if (response.data.length === 0) {
      break
    }

    // Pull Requestを除外（GitHub APIではPRもissuesに含まれる）
    const issues = response.data.filter(issue => !('pull_request' in issue))
    allIssues.push(...issues)

    console.log(`Fetched page ${page}: ${response.data.length} items (${issues.length} issues after filtering PRs)`)

    // 最後のページの場合は終了
    if (response.data.length < perPage) {
      break
    }

    page++
  }

  console.log(`Total issues fetched: ${allIssues.length}`)
  return allIssues
}

export async function getPullRequests(repo: string, githubToken?: string, since?: string): Promise<GitHubPullRequest[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion'
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  let allPullRequests: GitHubPullRequest[] = []
  let page = 1
  const perPage = 100

  // Pull Requests APIではsinceパラメータは利用できないため、取得後にフィルタリング
  const sinceDate = since ? new Date(since) : null

  while (true) {
    const response = await axios.get<GitHubPullRequest[]>(
      `https://api.github.com/repos/${repo}/pulls?state=all&page=${page}&per_page=${perPage}`,
      { headers }
    )

    if (response.data.length === 0) {
      break
    }

    // Pull Requests APIではsinceパラメータが使えないため、updated_atでフィルタリング
    let filteredPRs = response.data
    if (sinceDate) {
      filteredPRs = response.data.filter(pr => new Date(pr.updated_at) >= sinceDate)
    }
    
    allPullRequests.push(...filteredPRs)

    console.log(`Fetched PR page ${page}: ${response.data.length} pull requests${sinceDate ? ` (${filteredPRs.length} after since filter)` : ''}`)

    // 最後のページの場合は終了
    if (response.data.length < perPage) {
      break
    }

    page++
  }

  console.log(`Total pull requests fetched: ${allPullRequests.length}`)
  return allPullRequests
}

export async function getIssuesAndPullRequests(
  repo: string,
  includePullRequests: boolean,
  githubToken?: string,
  since?: string
): Promise<GitHubItem[]> {
  const items: GitHubItem[] = []

  // 常にIssueを取得
  const issues = await getIssues(repo, githubToken, since)
  items.push(...issues)

  // オプションでPull Requestを取得
  if (includePullRequests) {
    const pullRequests = await getPullRequests(repo, githubToken, since)
    items.push(...pullRequests)
  }

  return items
}

export async function getProjectStatus(
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken: string,
  projectName?: string
): Promise<string | null> {
  // 組織レベルプロジェクト対応のクエリ
  const query = `
    query($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          projectItems(first: 20) {
            nodes {
              project {
                title
                url
                owner {
                  ... on Organization {
                    login
                  }
                  ... on User {
                    login
                  }
                }
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
                project: { 
                  title: string
                  url: string
                  owner: {
                    login: string
                  }
                }
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
        url: item.project?.url,
        owner: item.project?.owner?.login,
        status: item.fieldValueByName?.name 
      }))
    )
    
    // プロジェクトのStatusを取得（より柔軟な検索）
    // 指定されたプロジェクト名を探し、なければ最初のプロジェクトを使用
    let targetItem: typeof projectItems[0] | undefined
    
    if (projectName) {
      targetItem = projectItems.find(item => item.project?.title === projectName)
      if (!targetItem) {
        console.log(`Specified project "${projectName}" not found`)
      }
    }
    
    if (!targetItem && projectItems.length > 0) {
      console.log(`${projectName ? `Specified project "${projectName}" not found, ` : ''}Using first available project: ${projectItems[0].project?.title}`)
      targetItem = projectItems[0]
    }
    
    return targetItem?.fieldValueByName?.name || null
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

export async function getProjectItems(
  owner: string,
  projectName?: string,
  githubToken?: string
): Promise<GitHubItem[]> {
  if (!githubToken) {
    console.log('GitHub token not provided, cannot fetch project items')
    return []
  }

  // 組織レベルプロジェクトから全アイテムを取得するクエリ
  const query = `
    query($owner: String!) {
      organization(login: $owner) {
        projectsV2(first: 20) {
          nodes {
            id
            title
            items(first: 100) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                content {
                  ... on Issue {
                    id
                    number
                    title
                    body
                    state
                    created_at: createdAt
                    updated_at: updatedAt
                    html_url: url
                    labels(first: 20) {
                      nodes {
                        name
                        color
                      }
                    }
                    assignees(first: 10) {
                      nodes {
                        login
                        avatar_url: avatarUrl
                      }
                    }
                    repository {
                      name
                      owner {
                        login
                      }
                    }
                  }
                  ... on PullRequest {
                    id
                    number
                    title
                    body
                    state
                    merged
                    draft
                    created_at: createdAt
                    updated_at: updatedAt
                    html_url: url
                    labels(first: 20) {
                      nodes {
                        name
                        color
                      }
                    }
                    assignees(first: 10) {
                      nodes {
                        login
                        avatar_url: avatarUrl
                      }
                    }
                    repository {
                      name
                      owner {
                        login
                      }
                    }
                  }
                }
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    console.log(`Fetching project items from organization: ${owner}`)
    
    const response = await axios.post<{
      data: {
        organization: {
          projectsV2: {
            nodes: Array<{
              id: string
              title: string
              items: {
                pageInfo: {
                  hasNextPage: boolean
                  endCursor: string | null
                }
                nodes: Array<{
                  id: string
                  content: any
                  fieldValues: {
                    nodes: Array<{
                      name: string
                      field: { name: string }
                    }>
                  }
                }>
              }
            }>
          }
        }
      }
      errors?: Array<{ message: string }>
    }>(
      'https://api.github.com/graphql',
      {
        query,
        variables: { owner }
      },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (response.data.errors) {
      console.error('GraphQL errors:', response.data.errors)
      return []
    }

    const projects = response.data.data?.organization?.projectsV2?.nodes || []
    
    // 指定されたプロジェクト名でフィルタ、なければ最初のプロジェクト
    let targetProject = projects.find(p => p.title === projectName) || projects[0]
    
    if (!targetProject) {
      console.log('No projects found')
      return []
    }

    console.log(`Using project: ${targetProject.title}`)
    
    const items: GitHubItem[] = []
    
    for (const item of targetProject.items.nodes) {
      const content = item.content
      if (!content) continue

      // Issue or PullRequest のcontentを GitHubItem 形式に変換
      if (content.repository) {
        const transformedItem: GitHubItem = {
          id: parseInt(content.id.replace(/\D/g, '')), // GraphQL IDから数値部分を抽出
          number: content.number,
          title: content.title,
          body: content.body || '',
          state: content.state.toLowerCase(),
          created_at: content.created_at,
          updated_at: content.updated_at,
          html_url: content.html_url,
          labels: content.labels?.nodes?.map((label: any) => ({
            name: label.name,
            color: label.color
          })) || [],
          assignees: content.assignees?.nodes?.map((assignee: any) => ({
            login: assignee.login,
            avatar_url: assignee.avatar_url
          })) || []
        }

        // Pull Request固有のフィールドを追加
        if ('merged' in content) {
          (transformedItem as any).merged = content.merged
          (transformedItem as any).draft = content.draft
        }

        items.push(transformedItem)
      }
    }

    console.log(`Found ${items.length} items in project "${targetProject.title}"`)
    return items

  } catch (error) {
    console.error('Error fetching project items:', error)
    return []
  }
}

export async function getSingleIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken?: string
): Promise<GitHubIssue | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion'
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  try {
    const response = await axios.get<GitHubIssue>(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      { headers }
    )

    // Pull Requestを除外
    if ('pull_request' in response.data) {
      return null
    }

    return response.data
  } catch (error) {
    console.error(`Error fetching issue #${issueNumber}:`, error)
    return null
  }
}

export async function getSinglePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  githubToken?: string
): Promise<GitHubPullRequest | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion'
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  try {
    const response = await axios.get<GitHubPullRequest>(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers }
    )

    return response.data
  } catch (error) {
    console.error(`Error fetching PR #${prNumber}:`, error)
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