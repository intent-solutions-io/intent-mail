# IntentMail

Multi-surface email platform with MCP server, Discord bot, and web dashboard. AI-powered email management with team collaboration features.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U5S225PTME)

## What This Is

A complete email management platform:
- **MCP Server**: 47 tools for programmatic email access (Gmail + Outlook)
- **Claude Code plugin**: install once for the `email-checkin`,
  `email-triage-actions`, and `email-project-context` skills (see below)
- **Discord Bot**: Slash commands for inbox management
- **Web Dashboard**: React/PWA for browser-based access
- **Team Collaboration**: Shared inboxes, assignments, analytics
- **AI Features**: Daily-digest, smart drafts, semantic search, inbox triage

---

## Status

**v0.4.1**

**Implemented:**
- Gmail connector (OAuth, History API delta sync)
- Outlook connector (OAuth PKCE, Microsoft Graph delta sync, flag/move/folders,
  attachment extraction, delta-poll "watch")
- 47 MCP tools with rules engine + rollback
- AI daily-digest + live-artifact daily-review surface
- OAuth tokens encrypted at rest (AES-256-GCM)
- Discord bot with slash commands
- Web dashboard with PWA support
- Team collaboration (shared inboxes, assignments)
- AI features (drafts, semantic search, triage)

**Not done:**
- Integration tests against a live mailbox (gated suite)
- Production deployment validation

---

## Use as a Claude Code plugin

IntentMail ships as a self-hosted Claude Code plugin — *you* hold the OAuth
token and the mailbox never leaves your machine.

```bash
git clone https://github.com/jeremylongshore/intent-mail
cd intent-mail
npm ci --omit=dev && npm run build   # build dist/ (the MCP server entry)
```

The plugin manifest is `.claude-plugin/plugin.json`; it wires the local
`intentmail` MCP server over stdio (`node bin/intentmail.js serve`), so its
tools resolve as `mcp__intentmail__mail_*`. It bundles three skills:

| Skill | What it does |
| --- | --- |
| `email-checkin` | Read-only daily digest — sync, triage (P1–P4 + "why"), summarize long threads, group, surface high-priority / needs-response. |
| `email-triage-actions` | Mutating, dry-run-first — archive/flag/move/draft and two-phase staged deletes, all audited + reversible. |
| `email-project-context` | Reads a plain-language `context/projects.md` and turns filing/priority intent into IntentMail rules (previewed before creation). |

Set `INTENTMAIL_MASTER_KEY` (see `.env.example`) so token encryption is keyed
explicitly in production. Configure an account with `mail_auth_start` and an AI
provider key, then ask Claude to "check my inbox".

---

## Quick Start (Development)

### Prerequisites

```bash
node --version  # v20 or higher
npm --version   # v10 or higher
```

### 1. Clone and Install

```bash
git clone https://github.com/jeremylongshore/intent-mail.git
cd intent-mail
npm install
```

### 2. Set Up Gmail OAuth (One-Time)

**Create OAuth credentials:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or use existing)
3. Enable **Gmail API**: https://console.cloud.google.com/apis/library/gmail.googleapis.com
4. Create **OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/oauth/callback`
5. Copy the **Client ID** and **Client Secret**

**Configure environment:**

```bash
cp .env.example .env
# Edit .env and add your credentials:
```

```bash
# .env
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REDIRECT_URI=http://localhost:3000/oauth/callback
```

**Set up OAuth consent screen** (required by Google):
1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Choose **External** (unless you have Google Workspace)
3. Fill in app name: `IntentMail Dev`
4. Add your email as a test user
5. Click **Save**

### 3. Build and Run

```bash
# Build TypeScript
npm run build

# Start MCP server
npm start
```

You should see:
```
Database initialized at ./data/intentmail.db
intentmail-mcp-server v0.1.0 started successfully
Listening on stdio...
```

### 4. Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "intentmail": {
      "command": "node",
      "args": ["<absolute-path-to-intent-mail>/dist/index.js"]
    }
  }
}
```

Replace `<absolute-path-to-intent-mail>` with the full path where you cloned the repository (e.g., `/Users/you/projects/intent-mail` on macOS, `/home/you/intent-mail` on Linux).

Restart Claude Desktop, then try:
```
Use the health_check tool
```

### 5. Authorize Gmail

In Claude Desktop:
```
Use mail_auth_start with provider: gmail
```

Click the URL, authorize, and you're ready!

---

## MCP Tools (47 Total)

### Authentication & Accounts
- `health_check` - Server status and capabilities
- `mail_auth_start` / `mail_auth_complete` - OAuth flow (Gmail/Outlook)
- `mail_list_accounts` - List connected accounts

### Email Operations
- `mail_sync` / `mail_sync_stats` - Delta sync + statistics
- `mail_search` / `mail_semantic_search` / `mail_parse_query` - Search
- `mail_get_thread` - Thread with all messages
- `mail_send` / `mail_draft` / `mail_compose_suggest` - Compose & send

### Daily Review & AI
- `mail_daily_digest` - Structured daily-review payload (stats, priority groups, why)
- `mail_triage` - Per-email P1–P4 priority + action + why + deadline
- `mail_summarize` - Long-thread / message summaries
- `mail_list_contexts` - List `@project:`/`@client:` context handles (context injection)

### Actions (write-through, provider-routed)
- `mail_action` - Consolidated op: mark_read / archive / flag / move / stage_delete / unsubscribe
- `mail_flag` - Flag / unflag (Outlook flag, Gmail STARRED)
- `mail_move` - Move to folder (Outlook) / relabel (Gmail)
- `mail_list_folders` - Folders (Outlook) / labels (Gmail)
- `mail_list_labels` / `mail_apply_label` - Labels

### Attachments
- `mail_list_attachments` / `mail_get_attachment` / `mail_extract_attachments` / `mail_attachment_stats`

### Safe Deletion (two-phase)
- `mail_stage_delete` / `mail_list_staged` / `mail_unstage` / `mail_commit_deletions` / `mail_deletion_log` / `mail_find_duplicates`

### Rules, Audit & Rollback
- `mail_list_rules` / `mail_create_rule` / `mail_delete_rule` / `mail_apply_rule`
- `mail_get_audit_log` / `mail_rollback`

### Real-time Sync & Analytics
- `mail_watch_start` / `mail_watch_stop` / `mail_watch_status` (Gmail push; Outlook delta-poll)
- `mail_analytics_summary` / `mail_analytics_query` / `mail_export_parquet`

---

## Architecture

```
┌──────────────────────────────────────────┐
│   Claude Code / AI Assistant             │
└────────────────┬─────────────────────────┘
                 │ MCP Protocol (stdio)
┌────────────────▼─────────────────────────┐
│   IntentMail MCP Server (Node.js)        │
│   ┌────────────────────────────────────┐ │
│   │ 47 MCP Tools                       │ │
│   │ (search, send, rules, rollback)    │ │
│   └──────────────┬─────────────────────┘ │
│                  │                        │
│   ┌──────────────▼─────────────────────┐ │
│   │ Rules Engine + Audit Log           │ │
│   │ (dry-run, plan, rollback)          │ │
│   └──────────────┬─────────────────────┘ │
│                  │                        │
│   ┌──────────────▼─────────────────────┐ │
│   │ SQLite Storage + FTS5 Search       │ │
│   │ (local database, full-text index)  │ │
│   └──────────────┬─────────────────────┘ │
└──────────────────┼───────────────────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
┌─────▼──────┐         ┌───────▼────────┐
│  Gmail API │         │  Outlook Graph │
│  (History) │         │  (Delta sync)  │
└────────────┘         └────────────────┘
```

---

## Features

### Delta Sync
- Gmail: Uses History API with `historyId` tracking
- Outlook: Uses Graph API `/delta` endpoint with `deltaToken`
- Only fetches changed emails, not entire mailbox
- Works alongside normal email usage (web, mobile apps)

### Rules-as-Code
```javascript
// Create a rule
mail_create_rule({
  name: "Archive Newsletters",
  conditions: [
    { field: "from", operator: "contains", value: "newsletter" }
  ],
  actions: [
    { type: "archive" }
  ]
})

// Test it first (dry-run)
mail_apply_rule({ ruleId: 1, dryRun: true })
// Shows: "Would archive 15 emails"

// Apply it
mail_apply_rule({ ruleId: 1, dryRun: false })

// Changed your mind?
mail_rollback({ ruleId: 1 })
// Restores all emails to previous state
```

### Audit Trail
All actions logged with before/after states:
```json
{
  "ruleId": 1,
  "emailId": 42,
  "stateBefore": { "labels": ["INBOX"], "flags": [] },
  "stateAfter": { "labels": ["ARCHIVED"], "flags": ["SEEN"] },
  "executedAt": "2025-12-24T10:00:00Z"
}
```

### Local Storage
- Email stored in SQLite (`./data/intentmail.db`)
- OAuth tokens encrypted with OS keychain
- No cloud storage required
- Offline access after initial sync

---

## Development Workflow

### Run Tests
```bash
npm test                 # Run all tests
npm run typecheck        # TypeScript strict mode check
```

### Database Inspection
```bash
sqlite3 ./data/intentmail.db
> .tables
> SELECT * FROM accounts;
> SELECT COUNT(*) FROM emails;
```

### OAuth Testing
```bash
# Automatic mode (opens browser)
node test-oauth-auto.js

# Manual mode (paste code)
node test-oauth.js
```

### Task Tracking
```bash
bd list                  # List all tasks
bd show <id>             # Show task details
bd update <id> --status in_progress
```

---

## Deployment

### Docker (Recommended)

**Quick start:**
```bash
docker-compose up -d
```

**For distribution:**
See [Docker Guide](000-docs/003-OD-DEPL-docker-deployment.md) for:
- Multi-platform builds (AMD64, ARM64)
- Docker Hub publishing
- Custom client connections
- Security best practices

### Deployment

This is a **self-hosted, stdio MCP** — you run it yourself; there is no cloud
deploy pipeline.

- **Local:** `npm ci && npm run build`, then `intentmail serve` (or wire it into
  your Claude Code / Claude Desktop config — see "Use as a Claude Code plugin").
- **Docker:** see the [Docker Guide](000-docs/003-OD-DEPL-docker-deployment.md).

---

## Security

OAuth 2.0 only. No passwords stored.

**Security features:**
- OAuth tokens encrypted (OS keychain)
- Input validation with Zod schemas
- Audit log for all actions
- Rate limiting with exponential backoff
- TypeScript strict mode

**Requirements:**
- Don't commit `.env` files
- Don't share OAuth credentials
- Test rules with dry-run first

Report vulnerabilities: [Security Policy](000-docs/002-TQ-SECU-security-policy.md)

---

## Roadmap

**Current (Phase 3):**
- Gmail connector (done)
- Rules engine (done)
- Outlook connector (needs testing)
- Integration tests (in progress)

**Next (Phase 4):**
- Real-time sync (push notifications)
- Background sync daemon
- Multi-account support
- Rule scheduling

**Later (Phase 5):**
- Web UI
- Analytics
- IMAP connector

---

## FAQ

**Q: Does this replace Gmail/Outlook?**
No - IntentMail is a layer on top. You keep using Gmail/Outlook normally. IntentMail just gives AI access to automate things.

**Q: What happens if I use Gmail while IntentMail is running?**
Everything stays in sync. Gmail is the source of truth. Changes you make in Gmail web/mobile show up in IntentMail, and vice versa.

**Q: Can I undo actions?**
Yes! Every rule execution is logged with before/after states. Use `mail_rollback` to restore emails to their previous state.

**Q: Is my email data safe?**
Email is stored locally in SQLite (not in the cloud). OAuth tokens are encrypted. Code is open source for review.

**Q: Does this work with personal Gmail accounts?**
Yes - works with both personal Gmail and Google Workspace accounts.

---

## Contributing

We welcome contributions! See [Contributing Guide](000-docs/032-DR-GUID-contributing.md) for:
- Code style guidelines
- How to add new connectors
- PR review process
- Where planning docs live

---

## Project Structure

```
intent-mail/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── mcp/tools/            # 47 MCP tool implementations
│   ├── connectors/           # Gmail, Outlook, IMAP
│   ├── rules/                # Rules engine + parser
│   ├── storage/              # SQLite + migrations
│   └── types/                # TypeScript interfaces
├── .github/workflows/        # CI (lint/test/build), security, release
├── test-oauth-auto.js        # OAuth testing scripts
└── data/                     # SQLite database (gitignored)
```

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).

---

## Links

- **Documentation**: [`000-docs/`](000-docs/)
- **GitHub**: https://github.com/jeremylongshore/intent-mail
- **Issues**: Use Beads task tracking (`bd list`)
- **Security**: [Security Policy](000-docs/002-TQ-SECU-security-policy.md)
- **FAQ**: [FAQ](000-docs/004-DR-FAQS-frequently-asked.md) - Common questions answered
- **Docker**: [Docker Guide](000-docs/003-OD-DEPL-docker-deployment.md) - Deployment guide

---

**Stack**: TypeScript, Node.js 20, SQLite, MCP SDK, Gmail API, Microsoft Graph

**Status**: Alpha. Breaking changes expected.
