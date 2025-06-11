# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that syncs GitHub Issues and Pull Requests to Notion databases with support for GitHub Projects v2 status synchronization. The action is built in TypeScript and compiled to a single JavaScript file for distribution.

## Build and Development Commands

- `npm run build`: Compile TypeScript and bundle with ncc to create `dist/index.js` for GitHub Actions
- TypeScript compilation outputs to `lib/` directory but the action uses the bundled `dist/index.js`

## Architecture

### Core Components

- **Entry Point**: `src/index.ts` - Main action logic that orchestrates the sync process
- **GitHub Service**: `src/services/github.ts` - Handles GitHub API interactions (Issues, PRs, Projects GraphQL)
- **Notion Service**: `src/services/notion.ts` - Manages Notion API operations and data transformation
- **Type Definitions**: `src/types/` - TypeScript interfaces for GitHub and Notion data structures

### Key Features

1. **Dual Sync Support**: Syncs both GitHub Issues and Pull Requests (configurable)
2. **GitHub Projects Integration**: Uses GraphQL API to fetch project status from GitHub Projects v2
3. **Status Mapping**: Maps specific Japanese GitHub project statuses to Notion status field
4. **Incremental Updates**: Checks for existing Notion pages and updates rather than duplicating

### Data Flow

1. Fetch issues/PRs from GitHub REST API
2. For each item, check if it exists in Notion database (by ID)
3. Create new Notion page or update existing one
4. If GitHub token provided, fetch project status via GraphQL and sync to Notion

### Important Implementation Details

- Uses `@vercel/ncc` to bundle the action into a single `dist/index.js` file
- GitHub Projects status is fetched specifically from a project named "Troika" (`src/services/github.ts:116`)
- Status mapping is hardcoded for Japanese project statuses (`src/services/notion.ts:248-259`)
- Supports both public and private repositories when GitHub token is provided
- Uses `@tryfabric/martian` for Markdown to Notion blocks conversion

## Required Secrets

Actions using this codebase need these secrets configured:
- `NOTION_API_KEY`: Notion integration token
- `NOTION_DATABASE_ID`: Target Notion database ID  
- `GITHUB_TOKEN`: GitHub token for private repos and Projects access

## Distribution

The `dist/` folder contains the compiled action and must be committed to the repository for GitHub Actions to use it. Run `npm run build` before committing changes.