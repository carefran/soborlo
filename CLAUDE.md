# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that syncs GitHub Issues and Pull Requests to Notion databases with support for GitHub Projects v2 status synchronization. The action is built in TypeScript and compiled to a single JavaScript file for distribution.

## 🏗️ Architecture Overview

### Core Components

**Entry Point**: `src/index.ts`
- Main orchestration logic for the GitHub Action
- Handles 24-hour filtering for incremental syncs (automatically syncs only items updated in last 24 hours)
- Manages both issue and pull request synchronization
- Coordinates GitHub Projects status synchronization

**GitHub Service**: `src/services/github.ts`
- Handles all GitHub API interactions (REST and GraphQL)
- Implements pagination for large repositories (100 items per page)
- Manages GitHub Projects v2 status retrieval via GraphQL
- Supports both public and private repository access
- Uses `since` parameter for Issues API, filters Pull Requests by `updated_at`

**Notion Service**: `src/services/notion.ts`
- Manages Notion API operations and data transformation
- Converts GitHub markdown to Notion blocks using `@tryfabric/martian`
- Handles page creation, updates, and status synchronization
- Maps Japanese GitHub project statuses to Notion

**Reverse Sync**: `src/reverse-sync.ts`
- Implements Notion → GitHub Projects status synchronization
- Smart matching by PBI-ID or title matching
- Dry-run capability for testing (`npm run reverse-sync:dry`)
- Excludes completed/invalid items from sync ("完了", "無効", "Not started")

## 🔄 Data Flow & Synchronization

### Primary Sync (GitHub → Notion)
1. **24-Hour Filtering**: Automatically calculates `since24h` timestamp and fetches only recently updated items
2. **Pagination**: Handles large repositories with proper API pagination
3. **Duplicate Detection**: Checks existing Notion pages by GitHub ID
4. **Content Sync**: Creates/updates Notion pages with GitHub data
5. **Status Synchronization**: Fetches GitHub Projects status via GraphQL and maps to Notion
6. **Error Handling**: Individual item failures don't stop the entire sync

### Reverse Sync (Notion → GitHub Projects)
1. **Selective Retrieval**: Gets Notion pages excluding "Not started", "完了", "無効" statuses
2. **Smart Matching**: Matches Notion pages to GitHub issues via PBI-ID or title matching
3. **Status Updates**: Syncs GitHub Projects status back to matched Notion pages
4. **Dry Run Support**: Test mode for validation before actual updates

## 📊 Current Features

### ✅ Implemented Features
1. **Dual Sync Support**: Syncs both GitHub Issues and Pull Requests (configurable)
2. **GitHub Projects Integration**: Uses GraphQL API to fetch project status from GitHub Projects v2
3. **Status Mapping**: Maps specific Japanese GitHub project statuses to Notion status field
4. **Incremental Updates**: Checks for existing Notion pages and updates rather than duplicating
5. **24-Hour Filtering**: Only syncs items updated in the last 24 hours for efficiency
6. **Full Pagination**: Fetches all items with proper API pagination (100 per page)
7. **Scheduled Sync**: Runs weekdays at 8 AM JST via cron (GitHub Projects v2 events not supported)
8. **Reverse Sync**: Bidirectional status synchronization from Notion to GitHub Projects
9. **Smart Matching**: PBI-ID based matching with title fallback for reverse sync

### 🚧 Roadmap Status
- ✅ **Phase 1**: GitHub Issues → Notion sync (Complete)
- ✅ **Phase 1.5**: GitHub Pull Requests → Notion sync (Complete)
- ✅ **Phase 2**: GitHub Projects Status → Notion sync (Complete)
- ✅ **Phase 2.5**: Notion → GitHub Projects status sync (Complete - reverse-sync.ts)
- 🚧 **Phase 3**: Full bidirectional sync with conflict resolution (Planned)

## 🔧 Technical Implementation Details

### GitHub Projects Integration
- Uses GraphQL API for GitHub Projects v2 status retrieval
- Specifically targets "Troika" project by default, falls back to first available project
- Supports organization-level projects with proper owner detection
- Maps specific Japanese statuses: "お手すきに", "Backlog", "今週やる", "着手中", "相談中", "完了"

### Notion Database Schema
Required properties:
- **Name** (Title): Issue/PR title
- **ID** (Number): GitHub issue/PR ID
- **Number** (Number): GitHub issue/PR number
- **State** (Select): Open/Closed
- **Status** (Status): Project status with specific Japanese values
- **Labels** (Multi-select): GitHub labels
- **URL** (URL): GitHub issue/PR URL
- **Type** (Select): Issue/Pull Request

### Performance Optimizations
- **24-Hour Window**: `const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()`
- **Pagination**: Issues API uses `since` parameter, Pull Requests filtered by `updated_at` after fetching
- **API Rate Limiting**: Proper delays between operations
- **Individual Error Handling**: Failed items don't break entire sync

## 🚀 Usage & Configuration

### Workflow Configuration
```yaml
on:
  issues:
    types: [opened, edited, deleted, reopened, closed]
  schedule:
    - cron: '0 23 * * 0-4'  # Weekdays 8AM JST (UTC 11PM previous day)
  workflow_dispatch:
```

### Input Parameters
- `repo`: Repository name (owner/repo)
- `NOTION_API_KEY`: Notion integration token
- `NOTION_DATABASE_ID`: Target Notion database ID
- `GITHUB_TOKEN`/`PROJECT_TOKEN`: GitHub token for API access (PROJECT_TOKEN preferred)
- `include_pull_requests`: Boolean flag for PR synchronization

### Local Commands
- `npm run build`: Compile TypeScript and bundle with ncc to create `dist/index.js`
- `npm run reverse-sync`: Execute reverse sync from Notion to GitHub Projects
- `npm run reverse-sync:dry`: Dry run of reverse sync for testing
- TypeScript compilation outputs to `lib/` directory but the action uses the bundled `dist/index.js`

## 📦 Dependencies & Build System

### Key Dependencies
- `@actions/core`: GitHub Actions integration
- `axios`: HTTP client for API calls
- `@tryfabric/martian`: Markdown to Notion blocks conversion
- `dotenv`: Environment variable management

### Build Process
- TypeScript compilation: `src/` → `lib/`
- Bundle creation: `@vercel/ncc` creates `dist/index.js` for GitHub Actions
- Distribution: `dist/` folder must be committed for GitHub Actions usage

## 🔍 Important Notes for Future Development

1. **API Rate Limits**: Proper delays implemented between operations to respect GitHub/Notion API limits
2. **Error Isolation**: Individual item sync failures don't affect other items
3. **Status Mapping**: Hardcoded Japanese status mappings in `mapGitHubStatusToNotion()` function
4. **Project Targeting**: Currently looks for "Troika" project first, then falls back to first available
5. **Token Hierarchy**: `PROJECT_TOKEN` takes precedence over `GITHUB_TOKEN` for enhanced permissions
6. **24-Hour Default**: Automatic time-based filtering reduces API usage
7. **Markdown Conversion**: Uses `@tryfabric/martian` with fallback to plain text paragraphs

## 🚨 Critical Implementation Details

### GitHub Projects v2 Limitations
- **No webhook support**: GitHub Actions doesn't support `project_v2_item` events
- **Solution**: Scheduled runs (weekdays 8 AM JST) + manual triggers for project status changes
- **GraphQL required**: Projects v2 status requires GraphQL API, not REST API

### Notion Property Handling
- **Minimal properties**: Only essential fields synced (removed Assignees, Milestone, PR-specific fields)
- **Status property**: Uses Notion's native Status property type
- **Type property**: Uses Select property (not Multi-select) for Issue/Pull Request

### Reverse Sync Logic
- **PBI-ID prioritization**: First attempts to match by PBI-ID pattern in title
- **Title matching**: Falls back to exact title matching
- **Status exclusions**: Skips "Not started", "完了", "無効" items
- **Dry run capability**: Safe testing before actual updates

## Required Secrets

Actions using this codebase need these secrets configured:
- `NOTION_API_KEY`: Notion integration token
- `NOTION_DATABASE_ID`: Target Notion database ID  
- `GITHUB_TOKEN`: GitHub token for private repos and Projects access
- `PROJECT_TOKEN`: (Optional) Enhanced GitHub token for Projects v2 access

## Distribution

The `dist/` folder contains the compiled action and must be committed to the repository for GitHub Actions to use it. Always run `npm run build` before committing changes.

## Recent Major Changes

1. **24-Hour Filtering Implementation** (Latest)
   - Added automatic time-based filtering to reduce API calls
   - Improves performance for scheduled runs
   - Maintains full sync capability when needed

2. **Pagination Support**
   - Handles repositories with 100+ issues/PRs
   - Uses GitHub API pagination properly
   - Prevents missing items due to API limits

3. **Reverse Sync Capabilities**
   - Bidirectional status synchronization
   - Smart matching algorithms
   - Dry-run testing capability

4. **Scheduled Execution**
   - Switched from unsupported project_v2_item events to cron-based scheduling
   - Weekday morning execution for optimal workflow integration