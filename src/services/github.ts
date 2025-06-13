import axios from 'axios'
import { GitHubIssue, GitHubPullRequest, GitHubItem } from '../types/github'
import { logger } from '../utils/logger'

export async function getIssues(repo: string, githubToken?: string, since?: string): Promise<GitHubIssue[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion',
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  const allIssues: GitHubIssue[] = []
  let page = 1
  const perPage = 100

  // since パラメータの構築
  const sinceParam = since ? `&since=${encodeURIComponent(since)}` : ''

  while (true) {
    const response = await axios.get<GitHubIssue[]>(
      `https://api.github.com/repos/${repo}/issues?state=all&page=${page}&per_page=${perPage}${sinceParam}`,
      { headers },
    )

    if (response.data.length === 0) {
      break
    }

    // Pull Requestを除外（GitHub APIではPRもissuesに含まれる）
    const issues = response.data.filter(issue => !('pull_request' in issue))
    allIssues.push(...issues)

    logger.debug(`Fetched page ${page}: ${response.data.length} items (${issues.length} issues after filtering PRs)`)

    // 最後のページの場合は終了
    if (response.data.length < perPage) {
      break
    }

    page++
  }

  logger.info(`Total issues fetched: ${allIssues.length}`)
  return allIssues
}

export async function getPullRequests(repo: string, githubToken?: string, since?: string): Promise<GitHubPullRequest[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion',
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  const allPullRequests: GitHubPullRequest[] = []
  let page = 1
  const perPage = 100

  // Pull Requests APIではsinceパラメータは利用できないため、取得後にフィルタリング
  const sinceDate = since ? new Date(since) : null

  while (true) {
    const response = await axios.get<GitHubPullRequest[]>(
      `https://api.github.com/repos/${repo}/pulls?state=all&page=${page}&per_page=${perPage}`,
      { headers },
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

    logger.debug(`Fetched PR page ${page}: ${response.data.length} pull requests${sinceDate ? ` (${filteredPRs.length} after since filter)` : ''}`)

    // 最後のページの場合は終了
    if (response.data.length < perPage) {
      break
    }

    page++
  }

  logger.info(`Total pull requests fetched: ${allPullRequests.length}`)
  return allPullRequests
}

export async function getIssuesAndPullRequests(
  repo: string,
  includePullRequests: boolean,
  githubToken?: string,
  since?: string,
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
  projectName?: string,
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
  `

  try {
    logger.debug(`Fetching project status for ${owner}/${repo}#${issueNumber}`)
    
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
        variables: { owner, repo, issueNumber },
      },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
        },
      },
    )

    // GraphQLエラーをチェック
    if (response.data.errors) {
      logger.error('GraphQL errors:', response.data.errors)
      return null
    }

    // レスポンス全体をデバッグ出力
    logger.debug(`GraphQL response for issue #${issueNumber}:`, JSON.stringify(response.data, null, 2))

    const repository = response.data.data?.repository
    if (!repository?.issue?.projectItems?.nodes) {
      return null
    }

    const projectItems = repository.issue.projectItems.nodes
    
    // 利用可能なプロジェクトをデバッグ出力
    logger.debug(`Available projects for issue #${issueNumber}:`, 
      projectItems.map(item => ({ 
        project: item.project?.title,
        url: item.project?.url,
        owner: item.project?.owner?.login,
        status: item.fieldValueByName?.name, 
      })),
    )
    
    // プロジェクトのStatusを取得（より柔軟な検索）
    // 指定されたプロジェクト名を探し、なければ最初のプロジェクトを使用
    let targetItem: typeof projectItems[0] | undefined
    
    if (projectName) {
      targetItem = projectItems.find(item => item.project?.title === projectName)
      if (!targetItem) {
        logger.warn(`Specified project "${projectName}" not found`)
      }
    }
    
    if (!targetItem && projectItems.length > 0) {
      logger.info(`${projectName ? `Specified project "${projectName}" not found, ` : ''}Using first available project: ${projectItems[0].project?.title}`)
      targetItem = projectItems[0]
    }
    
    return targetItem?.fieldValueByName?.name || null
  } catch (error) {
    logger.error('Error fetching project status:', error)
    return null
  }
}

export async function getProjectItems(
  owner: string,
  projectName?: string,
  githubToken?: string,
): Promise<GitHubItem[]> {
  if (!githubToken) {
    logger.warn('GitHub token not provided, cannot fetch project items')
    return []
  }

  // 組織レベルプロジェクトから全アイテムを取得するクエリ（ページネーション対応）
  const getProjectItemsQuery = (_cursor?: string) => `
    query($owner: String!, $cursor: String) {
      organization(login: $owner) {
        projectsV2(first: 20) {
          nodes {
            id
            title
            items(first: 100, after: $cursor) {
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
                    isDraft
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
  `

  try {
    logger.debug(`Fetching project items from organization: ${owner}`)
    
    // 初回クエリでプロジェクト一覧を取得
    const initialResponse = await axios.post<{
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
        query: getProjectItemsQuery(),
        variables: { owner, cursor: null },
      },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
        },
      },
    )

    if (initialResponse.data.errors) {
      logger.error('GraphQL errors:', initialResponse.data.errors)
      return []
    }

    const projects = initialResponse.data.data?.organization?.projectsV2?.nodes || []
    
    // 指定されたプロジェクト名でフィルタ、なければ最初のプロジェクト
    const targetProject = projects.find(p => p.title === projectName) || projects[0]
    
    if (!targetProject) {
      logger.warn('No projects found')
      return []
    }

    logger.info(`Using project: ${targetProject.title}`)
    
    const items: GitHubItem[] = []
    let hasNextPage = targetProject.items.pageInfo.hasNextPage
    let cursor = targetProject.items.pageInfo.endCursor
    
    // 初回のアイテムを処理
    const processItems = (itemNodes: any[]) => {
      for (const item of itemNodes) {
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
              color: label.color,
            })) || [],
            assignees: content.assignees?.nodes?.map((assignee: any) => ({
              login: assignee.login,
              avatar_url: assignee.avatar_url,
              html_url: `https://github.com/${assignee.login}`,
            })) || [],
            milestone: null, // GraphQLからはmilestone情報を取得していない
            user: {
              login: content.repository.owner.login,
              avatar_url: '',
              html_url: `https://github.com/${content.repository.owner.login}`,
            },
          }

          // Pull Request固有のフィールドを追加
          if ('merged' in content) {
            (transformedItem as any).merged = content.merged
            (transformedItem as any).draft = content.isDraft
          }

          items.push(transformedItem)
        }
      }
    }
    
    processItems(targetProject.items.nodes)
    logger.debug(`Processed initial page: ${targetProject.items.nodes.length} items`)

    // ページネーションで残りのアイテムを取得
    while (hasNextPage && cursor) {
      logger.debug(`Fetching next page with cursor: ${cursor}`)
      
      const nextResponse = await axios.post<{
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
          query: getProjectItemsQuery(cursor),
          variables: { owner, cursor },
        },
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (nextResponse.data.errors) {
        logger.error('GraphQL errors in pagination:', nextResponse.data.errors)
        break
      }

      const nextProject = nextResponse.data.data?.organization?.projectsV2?.nodes?.find(p => p.title === targetProject.title)
      if (!nextProject) {
        logger.warn('Target project not found in pagination response')
        break
      }

      processItems(nextProject.items.nodes)
      logger.debug(`Processed page: ${nextProject.items.nodes.length} items`)
      
      hasNextPage = nextProject.items.pageInfo.hasNextPage
      cursor = nextProject.items.pageInfo.endCursor
    }

    logger.info(`Found ${items.length} total items in project "${targetProject.title}"`)
    return items

  } catch (error) {
    logger.error('Error fetching project items:', error)
    return []
  }
}

export async function getSingleIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken?: string,
): Promise<GitHubIssue | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion',
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  try {
    const response = await axios.get<GitHubIssue>(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      { headers },
    )

    // Pull Requestを除外
    if ('pull_request' in response.data) {
      return null
    }

    return response.data
  } catch (error) {
    logger.error(`Error fetching issue #${issueNumber}:`, error)
    return null
  }
}

export async function getSinglePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  githubToken?: string,
): Promise<GitHubPullRequest | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'github-issue-2-notion',
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  try {
    const response = await axios.get<GitHubPullRequest>(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers },
    )

    return response.data
  } catch (error) {
    logger.error(`Error fetching PR #${prNumber}:`, error)
    return null
  }
}