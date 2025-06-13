export interface GitHubLabel {
  name: string
  color?: string
  description?: string
}

export interface GitHubUser {
  login: string
  avatar_url: string
  html_url: string
}

export interface GitHubMilestone {
  title: string
  due_on: string | null
}

export interface GitHubItem {
  id: number
  number: number
  title: string
  state: 'open' | 'closed'
  body: string | null
  html_url: string
  labels: GitHubLabel[]
  assignees: GitHubUser[]
  milestone: GitHubMilestone | null
  created_at: string
  updated_at: string
  user: GitHubUser
}

export interface GitHubIssue extends GitHubItem {
  // Issue固有のプロパティ
  repository?: {
    name: string
    owner: { login: string }
  }
}

export interface GitHubPullRequest extends GitHubItem {
  merged: boolean
  draft: boolean
  merged_at: string | null
  base: {
    ref: string
    sha: string
  }
  head: {
    ref: string
    sha: string
  }
  mergeable: boolean | null
  additions: number
  deletions: number
  changed_files: number
} 