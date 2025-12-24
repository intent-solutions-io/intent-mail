# IntentMail

MCP server for programmatic email access via Gmail/Outlook APIs. Provides tools for search, automation rules, and audit logging.

## What This Is

MCP server with 19 tools for email operations:
- Gmail/Outlook connector (OAuth, delta sync)
- Email search, threading, labels, attachments
- Automation rules with dry-run and rollback
- SQLite storage with FTS5 full-text search
- Complete audit trail of all actions

---

## Status

Alpha. Working but needs testing.

**Implemented:**
- Gmail connector (OAuth, History API delta sync)
- 19 MCP tools
- Rules engine with audit log + rollback
- SQLite storage with FTS5 search

**Not done:**
- Outlook connector OAuth testing
- Integration tests with real Gmail
- Production deployment validation

---

## Quick Start (Development)

### Prerequisites

```bash
node --version  # v20 or higher
npm --version   # v10 or higher
```

### 1. Clone and Install

```bash
git clone https://github.com/intent-solutions-io/intent-mail.git
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
      "args": ["/path/to/intent-mail/dist/index.js"]
    }
  }
}
```

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

## MCP Tools (19 Total)

### Authentication & Accounts
- `health_check` - Server status and capabilities
- `mail_auth_start` - Start OAuth flow (Gmail/Outlook)
- `mail_auth_complete` - Complete OAuth with code
- `mail_list_accounts` - List connected accounts

### Email Operations
- `mail_sync` - Sync emails from provider (delta sync)
- `mail_sync_stats` - View sync statistics
- `mail_search` - Full-text search with filters
- `mail_get_thread` - Get email thread with all messages
- `mail_send` - Send email with threading support

### Labels & Organization
- `mail_list_labels` - List all labels/folders
- `mail_apply_label` - Apply labels to emails

### Attachments
- `mail_list_attachments` - List email attachments
- `mail_get_attachment` - Download attachment

### Rules & Automation
- `mail_list_rules` - List automation rules
- `mail_create_rule` - Create new rule
- `mail_delete_rule` - Delete rule
- `mail_apply_rule` - Apply rule with dry-run support

### Audit & Rollback
- `mail_get_audit_log` - View execution history
- `mail_rollback` - Rollback rule executions

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
│   │ 19 MCP Tools                       │ │
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

## Deployment (Production)

### Docker
```bash
docker build -t intentmail .
docker run -p 3000:3000 intentmail
```

### Google Cloud Run
```bash
# Automated via GitHub Actions
git push origin main
# CI/CD deploys to Cloud Run automatically
```

See [SETUP.md](SETUP.md) for infrastructure details (Terraform, WIF).

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

Report vulnerabilities: [SECURITY.md](SECURITY.md)

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

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
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
│   ├── mcp/tools/            # 19 MCP tool implementations
│   ├── connectors/           # Gmail, Outlook, IMAP
│   ├── rules/                # Rules engine + parser
│   ├── storage/              # SQLite + migrations
│   └── types/                # TypeScript interfaces
├── infra/                    # Terraform (GCP deployment)
├── .github/workflows/        # CI/CD pipelines
├── test-oauth-auto.js        # OAuth testing scripts
└── data/                     # SQLite database (gitignored)
```

---

## License

TBD - To be determined once project reaches beta.

---

## Links

- **Documentation**: `completed-docs/intent-mail/000-docs/`
- **GitHub**: https://github.com/intent-solutions-io/intent-mail
- **Issues**: Use Beads task tracking (`bd list`)
- **Security**: [SECURITY.md](SECURITY.md)

---

**Stack**: TypeScript, Node.js 20, SQLite, MCP SDK, Gmail API, Microsoft Graph

**Status**: Alpha. Breaking changes expected.
