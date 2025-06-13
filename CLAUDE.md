# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that syncs GitHub Issues and Pull Requests to Notion databases with support for GitHub Projects v2 status synchronization. The action is built in TypeScript and compiled to a single JavaScript file for distribution.

## 🏗️ Architecture Overview

### Core Components

**Entry Point**: `src/index.ts`
- Main orchestration logic for the GitHub Action
- Handles event-based processing (issues/PRs) and scheduled sync (GitHub Projects)
- Manages both issue and pull request synchronization
- Coordinates GitHub Projects status synchronization

**Event Handler**: `src/services/event-handler.ts`
- Processes GitHub webhook events (issues, pull_request)
- Handles scheduled/manual execution for GitHub Projects sync
- Provides clear error handling for unsupported event types
- No fallback processing - fails fast for unknown events

**GitHub Service**: `src/services/github.ts`
- Handles all GitHub API interactions (REST and GraphQL)
- Implements pagination for large repositories (100 items per page)
- Manages GitHub Projects v2 status retrieval via GraphQL
- Supports both public and private repository access
- Clean API without time-based filtering (handled at event level)

**Notion Service**: `src/services/notion.ts`
- Manages Notion API operations and data transformation
- Converts GitHub markdown to Notion blocks using `@tryfabric/martian`
- Handles page creation, updates, and status synchronization
- Maps Japanese GitHub project statuses to Notion
- Dedicated GitHub ID-based search for existing pages

**Sync Processor**: `src/services/sync-processor.ts`
- Orchestrates individual item synchronization (`syncGitHubItemToNotion`)
- Handles existing page updates vs new page creation
- Manages GitHub Projects status synchronization
- Provides clear error handling and logging

**Reverse Sync**: `src/reverse-sync.ts`
- Implements Notion → GitHub Projects status synchronization
- Smart matching by PBI-ID or title matching
- Dry-run capability for testing (`npm run reverse-sync:dry`)
- Excludes completed/invalid items from sync ("完了", "無効", "Not started")

## 🔄 Data Flow & Synchronization

### Event-Based Processing
1. **Issue/PR Events**: Processes single items triggered by webhook events
2. **Scheduled/Manual**: Fetches all items from GitHub Projects v2
3. **No Fallback**: Unknown event types result in clear errors
4. **Targeted Processing**: Each event type has specific, optimized handling

### Primary Sync (GitHub → Notion)
1. **Event Detection**: Identifies event type and processes accordingly
2. **GitHub ID Matching**: Searches existing Notion pages by GitHub ID
3. **Content Sync**: Creates/updates Notion pages with GitHub data
4. **Status Synchronization**: Fetches GitHub Projects status via GraphQL and maps to Notion
5. **Error Handling**: Individual item failures don't stop the entire sync

### Reverse Sync (Notion → GitHub Projects)
1. **Selective Retrieval**: Gets Notion pages excluding "Not started", "完了", "無効" statuses
2. **Smart Matching**: Matches Notion pages to GitHub issues via PBI-ID or title matching
3. **Status Updates**: Syncs GitHub Projects status back to matched Notion pages
4. **Dry Run Support**: Test mode for validation before actual updates

## 📊 Current Features

### ✅ Implemented Features
1. **Event-Driven Sync**: Processes individual issues/PRs on webhook events
2. **GitHub Projects Integration**: Uses GraphQL API to fetch project status from GitHub Projects v2
3. **Status Mapping**: Maps specific Japanese GitHub project statuses to Notion status field
4. **Intelligent Updates**: Checks for existing Notion pages and updates rather than duplicating
5. **Scheduled Project Sync**: Syncs all GitHub Projects items on schedule/manual trigger
6. **Full Pagination**: Fetches all items with proper API pagination (100 per page)
7. **Scheduled Sync**: Runs weekdays at 8 AM JST via cron (GitHub Projects v2 events not supported)
8. **Reverse Sync**: Bidirectional status synchronization from Notion to GitHub Projects
9. **Smart Matching**: GitHub ID-based matching with fallback to creation
10. **Clear Error Handling**: Fail-fast approach for unsupported configurations

### 🚧 Roadmap Status
- ✅ **Phase 1**: GitHub Issues → Notion sync (Complete)
- ✅ **Phase 1.5**: GitHub Pull Requests → Notion sync (Complete)
- ✅ **Phase 2**: GitHub Projects Status → Notion sync (Complete)
- ✅ **Phase 2.5**: Notion → GitHub Projects status sync (Complete - reverse-sync.ts)
- ✅ **Phase 3**: Event-driven architecture with clean error handling (Complete)
- 🚧 **Phase 4**: Full bidirectional sync with conflict resolution (Planned)

## 🔧 Technical Implementation Details

### Event Processing Architecture
- **Issue Events**: Processes single issue via `getSingleIssue`
- **PR Events**: Processes single PR via `getSinglePullRequest`
- **Scheduled/Manual**: Processes all GitHub Projects items via `getProjectItems`
- **Unknown Events**: Throws clear error with supported event types

### GitHub Projects Integration
- Uses GraphQL API for GitHub Projects v2 status retrieval
- Specifically targets "Troika" project by default, falls back to first available project
- Supports organization-level projects with proper owner detection
- Maps specific Japanese statuses: "お手すきに", "Backlog", "今週やる", "着手中", "相談中", "完了"

### Notion Database Schema
Required properties:
- **Name** (Title): Issue/PR title
- **ID** (Rich Text): GitHub ID for unique identification
- **Number** (Number): GitHub issue/PR number
- **State** (Select): Open/Closed
- **Status** (Status): Project status with specific Japanese values
- **Labels** (Multi-select): GitHub labels
- **URL** (URL): GitHub issue/PR URL
- **Type** (Select): Issue/Pull Request
- **Product** (Select): Repository/Product name for categorization

### Performance Optimizations
- **Event-Driven**: Only processes relevant items, no time-based filtering
- **Pagination**: Efficient API pagination for large datasets
- **API Rate Limiting**: Proper delays between operations
- **Individual Error Handling**: Failed items don't break entire sync
- **Clean APIs**: Removed unused parameters and fallback logic

## 🚀 Usage & Configuration

### Workflow Configuration
```yaml
on:
  issues:
    types: [opened, edited, deleted, reopened, closed]
  pull_request:
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

1. **Event-Driven Architecture**: System responds to specific events, no fallback processing
2. **Clear Error Handling**: Unknown events result in explicit errors with guidance
3. **API Rate Limits**: Proper delays implemented between operations to respect GitHub/Notion API limits
4. **Error Isolation**: Individual item sync failures don't affect other items
5. **Status Mapping**: Hardcoded Japanese status mappings in `mapGitHubStatusToNotion()` function
6. **Project Targeting**: Currently looks for "Troika" project first, then falls back to first available
7. **Token Hierarchy**: `PROJECT_TOKEN` takes precedence over `GITHUB_TOKEN` for enhanced permissions
8. **GitHub ID Matching**: Uses GitHub's node_id for reliable page identification
9. **Markdown Conversion**: Uses `@tryfabric/martian` with fallback to plain text paragraphs

## 🚨 Critical Implementation Details

### GitHub Projects v2 Limitations
- **No webhook support**: GitHub Actions doesn't support `project_v2_item` events
- **Solution**: Scheduled runs (weekdays 8 AM JST) + manual triggers for project status changes
- **GraphQL required**: Projects v2 status requires GraphQL API, not REST API

### Notion Property Handling
- **ID Field**: Uses Rich Text property type for GitHub ID storage (due to Notion API limitations)
- **Status property**: Uses Notion's native Status property type
- **Type property**: Uses Select property (not Multi-select) for Issue/Pull Request
- **Page Creation Timing**: ID property set after page creation due to Notion API restrictions

### Event Processing Logic
- **Single Item Events**: Issue/PR webhooks process only the triggered item
- **Batch Processing**: Scheduled runs process all GitHub Projects items
- **No Time Filtering**: Removed `since` parameter and 24-hour filtering logic
- **Fail-Fast**: Unknown event types result in immediate, clear errors

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

1. **Architecture Cleanup & Refactoring** (Latest)
   - Removed unused `since` parameter and 24-hour filtering logic
   - Eliminated fallback processing for unknown events
   - Renamed functions for clarity (`processSingleItem` → `syncGitHubItemToNotion`)
   - Optimized logging to reduce redundancy
   - Clear event-driven architecture with fail-fast error handling

2. **GitHub ID Standardization**
   - Unified GitHub ID handling using `node_id` for consistency
   - Simplified Notion page search to use only GitHub ID
   - Removed complex fallback search strategies

3. **Status Synchronization**
   - Simplified status mapping logic
   - Clear separation of concerns between GitHub and Notion services

4. **Event Processing**
   - Clear separation between single-item events and batch processing
   - Removed unnecessary complexity from event handling
   - Improved error messages for unsupported events