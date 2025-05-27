# GitHub-issue-2-Notion
A simple tool to sync GitHub issues to Notion beautifully

## Features

- [x] Sync issue to Notion
- [x] Sync State to Notion
- [x] Sync labels to Notion
- [x] Sync URL to Notion
- [x] Sync content to Notion with full markdown support
- [x] Won't repeat recreating the same issue
- [x] Update status if exists

## Setup

### 1. Create Notion Integration

1. Create a new integration in [Notion](https://www.notion.so/my-integrations/) and get the token
2. Create a database in Notion with the following properties:
   - **Name** (Title)
   - **ID** (Number) - for GitHub issue ID
   - **Number** (Number) - for GitHub issue number
   - **State** (Select) - with options: "Open", "Closed"
   - **Status** (Status) - for tracking progress
   - **Labels** (Multi-select) - for GitHub labels
   - **URL** (URL) - for GitHub issue link

3. Share the database with your integration

### 2. Get Database ID

Copy database ID from the URL of the database:
- For example: `https://www.notion.so/myworkspace/Database-1234567890abcdef1234567890abcdef`
- `1234567890abcdef1234567890abcdef` is the database ID

### 3. Set GitHub Secrets

Set three GitHub secrets in the repository settings:
- `NOTION_API_KEY`: The token of the Notion integration
- `NOTION_DATABASE_ID`: The ID of the Notion database

### 4. Create Workflow

Create a workflow file `.github/workflows/sync-issues.yml` in your repository:

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
          # Optional: Add GITHUB_TOKEN for private repositories or to avoid rate limits
          # GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Note**: 
- For public repositories, `GITHUB_TOKEN` is optional
- For private repositories, you must provide `GITHUB_TOKEN`
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
   ```
4. Run: `node index.js`

## Requirements

- Node.js 20 or later
- A Notion workspace with integration access
- GitHub repository with issues to sync

## Development

### Building the Action

This GitHub Action uses `@vercel/ncc` to bundle all dependencies into a single file. When making changes:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Make your changes to `index.js`

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