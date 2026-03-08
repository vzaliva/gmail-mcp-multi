# Gmail MCP Multi — Claude Development Guidelines

## What This Is
MCP server that provides Gmail access across multiple accounts. Lets AI assistants search, read, send, and manage email across personal and work accounts with a single tool.

## Tech Stack
- **Runtime:** Node.js, TypeScript
- **Protocol:** MCP (Model Context Protocol) via @modelcontextprotocol/sdk
- **Auth:** Google OAuth 2.0 (browser-based flow)
- **Storage:** Local JSON file for credentials

## Architecture Principles
- Each account has a friendly alias (e.g., "personal", "work")
- OAuth tokens stored locally, auto-refreshed
- Tools are MCP-standard: list_accounts, authenticate, search_emails, read_email, send_email, modify_email, list_labels
- All tools take an `account` parameter to specify which mailbox

## Current State
- PR #7 has the full initial implementation ready to merge
- Closes issues #1-#5
- Needs testing with real Gmail accounts before merge

## Development
```bash
npm install
npm run build
npm run dev  # for watch mode
```

## Testing
```bash
npm test
```
