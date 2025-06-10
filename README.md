# GitHub-issue-2-Notion

A simple tool to sync GitHub issues and pull requests to Notion beautifully

## Features

- [x] Sync issues to Notion
- [x] Sync pull requests to Notion (new feature!)
- [x] Sync state to Notion
- [x] Sync labels to Notion
- [x] Sync URL to Notion
- [x] Sync content to Notion with full markdown support
- [x] Sync assignees and milestones
- [x] Pull request specific data (draft, merged, branches, changes)
- [x] Won't repeat recreating the same items
- [x] Update status if exists

## Setup

### 1. Create Notion Integration

1. Create a new integration in [Notion](https://www.notion.so/my-integrations/) and get the token
2. Create a database in Notion with the following properties:

   **Required Properties:**
   - **Name** (Title)
   - **ID** (Number) - for GitHub item ID
   - **Number** (Number) - for GitHub item number
   - **State** (Select) - with options: "Open", "Closed"
   - **Status** (Status) - for tracking progress
   - **Labels** (Multi-select) - for GitHub labels
   - **URL** (URL) - for GitHub item link
   - **Type** (Select) - with options: "Issue", "Pull Request"

   **Optional Properties (for enhanced features):**
   - **Assignees** (Multi-select) - for GitHub assignees
   - **Milestone** (Rich text) - for GitHub milestone
   - **Draft** (Checkbox) - for pull request draft status
   - **Merged** (Checkbox) - for pull request merged status
   - **Base Branch** (Rich text) - for pull request base branch
   - **Head Branch** (Rich text) - for pull request head branch
   - **Additions** (Number) - for pull request added lines
   - **Deletions** (Number) - for pull request deleted lines
   - **Changed Files** (Number) - for pull request changed files count

3. Share the database with your integration

### 2. Get Database ID

Copy database ID from the URL of the database:

- For example: `https://www.notion.so/myworkspace/Database-1234567890abcdef1234567890abcdef`
- `1234567890abcdef1234567890abcdef` is the database ID

### 3. Set GitHub Secrets

Set the following GitHub secrets in the repository settings:

#### Required Secrets:

- `NOTION_API_KEY`: The token of the Notion integration
- `NOTION_DATABASE_ID`: The ID of the Notion database

#### Optional Secret (for private repositories):

- `GITHUB_TOKEN`: GitHub personal access token or the default token

##### Using the default GITHUB_TOKEN (Recommended):

The easiest way is to use the default `GITHUB_TOKEN` that GitHub automatically provides:

```yaml
GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This token has read access to the repository where the workflow runs.

##### Using a Personal Access Token (PAT):

If you need to sync issues from a different repository or need more permissions:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Notion Sync")
4. Select the following scopes:
   - `repo` (for private repositories)
   - `public_repo` (for public repositories only)
5. Generate the token and copy it
6. Add it as a secret named `GITHUB_TOKEN` in your repository settings

### 4. Create Workflow

Create a workflow file `.github/workflows/sync-issues.yml` in your repository:

#### For Issues Only (Default):

```yaml
name: Sync issues to Notion

on:
  issues:
    types: [opened, edited, deleted, closed, reopened]
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Notion GitHub Issues Automation
        uses: carefran/GitHub-issue-2-Notion@main
        with:
          repo: ${{ github.repository }}
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### For Issues and Pull Requests:

```yaml
name: Sync issues and pull requests to Notion

on:
  issues:
    types: [opened, edited, deleted, closed, reopened]
  pull_request:
    types: [opened, edited, closed, reopened, synchronize]
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Notion GitHub Issues and PRs Automation
        uses: carefran/GitHub-issue-2-Notion@main
        with:
          repo: ${{ github.repository }}
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          include_pull_requests: "true"
```

## Configuration Options

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `repo` | The GitHub repository name (owner/repo) | Yes | - |
| `NOTION_API_KEY` | The Notion API token | Yes | - |
| `NOTION_DATABASE_ID` | The ID of the Notion database | Yes | - |
| `GITHUB_TOKEN` | GitHub token for API access | No | - |
| `include_pull_requests` | Whether to sync pull requests | No | `false` |

**Note**:

- For public repositories, `GITHUB_TOKEN` is optional but recommended to avoid rate limits
- For private repositories, `GITHUB_TOKEN` is required
- The default `GITHUB_TOKEN` provided by GitHub Actions has read access to the repository

## Manual Testing

You can also run this locally for testing:

1. Clone this repository
2. Install dependencies: `npm install`
3. Set environment variables:
   ```bash
   export repo="owner/repository-name"
   export NOTION_API_KEY="your-notion-token"
   export NOTION_DATABASE_ID="your-database-id"
   export include_pull_requests="true"  # Optional: to include PRs
   # Optional: For private repositories
   export GITHUB_TOKEN="your-github-token"
   ```
4. Run: `node index.js`

## Requirements

- Node.js 20 or later
- A Notion workspace with integration access
- GitHub repository with issues/pull requests to sync

## Development

### Building the Action

This GitHub Action uses `@vercel/ncc` to bundle all dependencies into a single file. When making changes:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Make your changes to `src/index.ts`

3. Build the action:

   ```bash
   npm run build
   ```

4. Commit both your changes and the `dist/` folder:
   ```bash
   git add .
   git commit -m "Your commit message"
   git push
   ```

**Important**: Always run `npm run build` before committing to ensure the `dist/index.js` file is up to date with your changes.
