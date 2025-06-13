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

  const issues = await getIssues(repo, githubToken, since)
  // REST APIとGraphQL APIでIDの統一性を保つため、node_idを使用
  const transformedIssues = issues.map(issue => ({
    ...issue,
    id: (issue as any).node_id,
  }))
  items.push(...transformedIssues)

  if (includePullRequests) {
    const pullRequests = await getPullRequests(repo, githubToken, since)
    const transformedPRs = pullRequests.map(pr => ({
      ...pr,
      id: (pr as any).node_id,
    }))
    items.push(...transformedPRs)
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
    logger.debug('GraphQL query variables:', { owner, repo, issueNumber })
    logger.debug('GraphQL query:', query.replace(/\s+/g, ' ').trim())
    
    const startTime = Date.now()
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
    
    const duration = Date.now() - startTime
    logger.debug(`⏱️ GraphQL query completed in ${duration}ms`)

    if (response.data.errors) {
      logger.error('❌ GraphQL errors:', response.data.errors)
      return null
    }

    logger.debug(`📡 HTTP Response Status: ${response.status}`)
    logger.debug(`📋 GraphQL response for issue #${issueNumber}:`, JSON.stringify(response.data, null, 2))

    const repository = response.data.data?.repository
    if (!repository) {
      logger.warn(`⚠️ Repository ${owner}/${repo} not found or not accessible`)
      return null
    }
    
    if (!repository.issue) {
      logger.warn(`⚠️ Issue #${issueNumber} not found in ${owner}/${repo}`)
      return null
    }
    
    if (!repository.issue.projectItems?.nodes) {
      logger.info(`Issue #${issueNumber} is not associated with any projects`)
      return null
    }

    const projectItems = repository.issue.projectItems.nodes
    logger.info(`Issue #${issueNumber} found in ${projectItems.length} project(s)`)
    
    logger.debug(`Available projects for issue #${issueNumber}:`)
    projectItems.forEach((item, index) => {
      logger.debug(`  ${index + 1}. Project: "${item.project?.title}" (Owner: ${item.project?.owner?.login})`)
      logger.debug(`     Status: "${item.fieldValueByName?.name || 'No Status'}"`)
      logger.debug(`     URL: ${item.project?.url || 'No URL'}`)
    })
    
    // 指定されたプロジェクト名を探し、なければ最初のプロジェクトを使用
    let targetItem: typeof projectItems[0] | undefined
    
    if (projectName) {
      logger.debug(`Looking for specified project: "${projectName}"`)
      targetItem = projectItems.find(item => item.project?.title === projectName)
      if (!targetItem) {
        logger.warn(`⚠️ Specified project "${projectName}" not found`)
        logger.debug('Available project names:', projectItems.map(item => item.project?.title).filter(Boolean))
      } else {
        logger.debug(`Found specified project: "${projectName}"`)
      }
    }
    
    if (!targetItem && projectItems.length > 0) {
      const firstProject = projectItems[0].project?.title
      logger.info(`${projectName ? `Specified project "${projectName}" not found, ` : ''}Using first available project: "${firstProject}"`)
      targetItem = projectItems[0]
    }
    
    const status = targetItem?.fieldValueByName?.name ?? null
    logger.info(`GitHub Projects status: "${status || 'No Status'}" for issue #${issueNumber}`)
    
    return status
  } catch (error) {
    logger.error('❌ Error fetching project status:', error)
    if (axios.isAxiosError(error)) {
      logger.error('API Error Details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method
      })
    }
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
    const targetProject = projects.find(p => p.title === projectName) ?? projects[0]
    
    if (!targetProject) {
      logger.warn('No projects found')
      return []
    }

    logger.info(`Using project: ${targetProject.title}`)
    
    const items: GitHubItem[] = []
    let hasNextPage = targetProject.items.pageInfo.hasNextPage
    let cursor = targetProject.items.pageInfo.endCursor
    
    const processItems = async (itemNodes: any[]) => {
      for (const item of itemNodes) {
        const content = item.content
        if (!content) continue

        if (content.repository) {
          logger.debug(`Processing item: #${content.number}`)
          logger.debug(`  GraphQL Node ID: "${content.id}" (type: ${typeof content.id})`)
          logger.debug(`  Title: "${content.title}"`)
          
          const transformedItem: GitHubItem = {
            id: content.id,  // GraphQLのnode IDを直接使用（文字列）
            number: content.number,
            title: content.title,
            body: content.body ?? '',
            state: content.state.toLowerCase(),
            created_at: content.created_at,
            updated_at: content.updated_at,
            html_url: content.html_url,
            labels: content.labels?.nodes?.map((label: any) => ({
              name: label.name,
              color: label.color,
            })) ?? [],
            assignees: content.assignees?.nodes?.map((assignee: any) => ({
              login: assignee.login,
              avatar_url: assignee.avatar_url,
              html_url: `https://github.com/${assignee.login}`,
            })) ?? [],
            milestone: null, // GraphQLからはmilestone情報を取得していない
            user: {
              login: content.repository.owner.login,
              avatar_url: '',
              html_url: `https://github.com/${content.repository.owner.login}`,
            },
          }

          logger.debug(`  Transformed item ID: "${transformedItem.id}" (type: ${typeof transformedItem.id})`)

          // Pull Request固有のフィールドを追加
          if ('merged' in content) {
            (transformedItem as any).merged = content.merged;
            (transformedItem as any).draft = content.isDraft
          }

          items.push(transformedItem)
        }
      }
    }
    
    await processItems(targetProject.items.nodes)
    logger.debug(`Processed initial page: ${targetProject.items.nodes.length} items`)

    // GraphQL APIのページネーション制限により複数回リクエストが必要
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

      await processItems(nextProject.items.nodes)
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

    // GitHub APIはPRもissueエンドポイントで返すため除外
    if ('pull_request' in response.data) {
      return null
    }

    return {
      ...response.data,
      id: (response.data as any).node_id,
    }
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

    return {
      ...response.data,
      id: (response.data as any).node_id,
    }
  } catch (error) {
    logger.error(`Error fetching pull request #${prNumber}:`, error)
    return null
  }
}