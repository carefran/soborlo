# Soborlo

A GitHub Action that automatically syncs GitHub Issues and Pull Requests to Notion, with **GitHub Projects Status synchronization**.

> **Based on**: This project is based on [Edit-Mr/GitHub-issue-2-Notion](https://github.com/Edit-Mr/GitHub-issue-2-Notion) with significant enhancements and additional features.

## ✨ Features

- **GitHub Issues → Notion**: Automatically sync issue details (title, labels, assignees, etc.)
- **GitHub Pull Requests → Notion**: Sync PR information including merge status, branches, and changes
- **GitHub Projects Status → Notion**: Sync status from GitHub Projects v2 to Notion database ✨ **NEW**
- **Real-time updates**: Triggered by GitHub events (issues, PRs, project changes)
- **Customizable**: Configure which information to sync and how

## 📋 Status Mapping

GitHub Projects status is automatically mapped to Notion status:

| GitHub Projects | Notion Status |
|----------------|---------------|
| お手すきに     | お手すきに    |
| Backlog        | Backlog       |
| 今週やる       | 今週やる      |
| 着手中         | 着手中        |
| 相談中         | 相談中        |
| 完了           | 完了          |

## 🚀 Usage

### 1. Set up Notion Database

Create a Notion database with the following properties:
- **Name** (Title)
- **ID** (Number) 
- **Number** (Number)
- **State** (Select: Open, Closed)
- **Status** (Status: Not started, お手すきに, Backlog, 今週やる, 着手中, 相談中, レビュー中, 無効, 完了)
- **Labels** (Multi-select)
- **URL** (URL)
- **Type** (Select: Issue, Pull Request)

### 2. Create GitHub Workflow

Create `.github/workflows/notion-sync.yml`:

```yaml
name: Sync Issues to Notion

on:
  issues:
    types: [opened, edited, deleted, reopened, closed]
  schedule:
    - cron: '0 23 * * 0-4'  # 平日JST8時 (UTC前日23時)
  workflow_dispatch:

jobs:
  sync-issues:
    runs-on: ubuntu-latest
    steps:
      - name: Sync to Notion
        uses: carefran/soborlo@main
        with:
          repo: ${{ github.repository }}
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}
          include_pull_requests: "true"
          project_name: "My Project"  # Optional: specify project name
```

### 3. Configure Secrets

Add these secrets to your repository settings:
- `NOTION_API_KEY`: Your Notion integration token
- `NOTION_DATABASE_ID`: The ID of your Notion database
- `GITHUB_TOKEN`: GitHub token (recommended for GitHub Projects sync)
- `PROJECT_TOKEN`: Personal Access Token with project permissions (alternative to GITHUB_TOKEN for enhanced Projects access)

## 🔧 Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `repo` | Repository name (owner/repo) | Yes | - |
| `NOTION_API_KEY` | Notion API integration token | Yes | - |
| `NOTION_DATABASE_ID` | Notion database ID | Yes | - |
| `GITHUB_TOKEN` | GitHub token for Projects access | No | - |
| `PROJECT_TOKEN` | Personal Access Token (alternative to GITHUB_TOKEN) | No | - |
| `include_pull_requests` | Include PRs in sync | No | `false` |
| `project_name` | GitHub Projects v2 name to sync from | No | First available |

## 🔄 Synchronization Events

The action is triggered by:
- **Issue events**: opened, edited, deleted, reopened, closed
- **Scheduled sync**: Weekdays at 8:00 AM JST for Projects status updates
- **Manual trigger**: workflow_dispatch

## 🛣️ Roadmap

- ✅ GitHub Issues → Notion sync
- ✅ GitHub Pull Requests → Notion sync  
- ✅ GitHub Projects Status → Notion sync
- 🚧 **Phase 2**: Notion → GitHub Projects sync (planned)
- 🚧 **Phase 3**: Full bidirectional sync with conflict resolution

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
