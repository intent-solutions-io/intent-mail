# IntentMail MCP Server

Model Context Protocol server for programmable email access with Gmail, Outlook, and IMAP/SMTP connectors.

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode (auto-reload)
npm run dev

# Run production build
npm start
```

### Usage with Claude Desktop

Add to your Claude Desktop MCP configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "intentmail": {
      "command": "node",
      "args": [
        "/path/to/intent-mail/dist/index.js"
      ],
      "env": {
        "SQLITE_DB_PATH": "./data/intentmail.db"
      }
    }
  }
}
```

## Available Tools

### System Tools
- `health_check` - Verify server is running and check capabilities

### Authentication

#### OAuth (Gmail/Outlook)
- `mail_auth_start` - Start OAuth flow for Gmail or Outlook account
- `mail_auth_complete` - Complete OAuth flow with authorization code

#### IMAP/SMTP (App Passwords)
- `mail_imap_auth` - Authenticate with IMAP/SMTP using app password (Gmail, Outlook, iCloud, custom IMAP)

### Account Management
- `mail_list_accounts` - List all configured email accounts
- `mail_list_folders` - List all folders/mailboxes for an account (Gmail labels, Outlook folders, IMAP mailboxes)

### Email Sync & Search
- `mail_sync` - Sync emails from server (initial or delta sync)
- `mail_sync_stats` - Get sync statistics and metrics
- `mail_search` - Search locally-synced emails with FTS5 full-text search
- `mail_imap_search` - Search directly on IMAP server (without full sync)

### Email Operations
- `mail_get_thread` - Get email thread by ID
- `mail_list_labels` - List available labels/folders
- `mail_apply_label` - Apply label to emails
- `mail_send` - Compose and send email (supports OAuth and SMTP)
- `mail_list_attachments` - List attachments for an email
- `mail_get_attachment` - Download attachment data

### Rules Engine
- `mail_list_rules` - List automation rules
- `mail_create_rule` - Create new automation rule (YAML-based)
- `mail_delete_rule` - Delete automation rule
- `mail_apply_rule` - Apply rule to matching emails

### Audit & Rollback
- `mail_get_audit_log` - View audit log of email operations
- `mail_rollback` - Rollback previous email operations

## Authentication Methods

### OAuth 2.0 (Gmail/Outlook)

For full API access with Gmail or Microsoft 365:

1. Start OAuth flow:
   ```
   Use mail_auth_start with provider "gmail" or "outlook"
   ```
2. User visits authorization URL and grants permission
3. Complete with authorization code:
   ```
   Use mail_auth_complete with the code from redirect
   ```

**Requirements:**
- Gmail: Google Cloud Console project with Gmail API enabled
- Outlook: Azure AD app registration with Mail.ReadWrite permissions

### IMAP/SMTP (App Passwords)

For simpler setup without OAuth configuration:

1. Generate an app password:
   - **Gmail**: Enable 2FA, then generate at https://myaccount.google.com/apppasswords
   - **Outlook**: Enable 2FA, then generate at https://account.live.com/proofs/AppPassword
   - **iCloud**: Enable 2FA, then generate at https://appleid.apple.com/account/manage

2. Authenticate:
   ```
   Use mail_imap_auth with email and app password
   ```

**Supported Providers:**
- Gmail (`gmail.com`, `googlemail.com`)
- Outlook/Hotmail (`outlook.com`, `hotmail.com`, `live.com`)
- iCloud (`icloud.com`, `me.com`, `mac.com`)
- Yahoo (`yahoo.com`)
- Custom IMAP servers (specify host/port manually)

## Development

### TypeScript

Strict mode enabled with full type safety:
```bash
npm run typecheck  # Type check without building
npm run build      # Compile TypeScript
```

### Testing

```bash
npm test           # Run tests
npm run test:watch # Watch mode
```

### Linting

```bash
npm run lint       # Check code quality
npm run lint:fix   # Auto-fix issues
```

## Docker

### Build Image

```bash
docker build -t intentmail-mcp-server .
```

### Run Container

```bash
docker run -it --rm \
  -e SQLITE_DB_PATH=/data/intentmail.db \
  -v $(pwd)/data:/data \
  intentmail-mcp-server
```

## Architecture

```
src/
├── index.ts                    # MCP server entry point
├── config.ts                   # Configuration constants
├── mcp/
│   └── tools/                  # MCP tool implementations
│       ├── health.ts           # Health check
│       ├── mail-auth-*.ts      # Authentication tools
│       ├── mail-search.ts      # Email search
│       ├── mail-imap-search.ts # Direct IMAP search
│       ├── mail-send.ts        # Send email
│       └── ...                 # Other tools
├── connectors/
│   ├── gmail/                  # Gmail OAuth + API client
│   ├── outlook/                # Outlook Graph API client
│   └── imap/                   # IMAP/SMTP connector
│       ├── connection.ts       # IMAP connection
│       ├── smtp.ts             # SMTP connection
│       ├── sync.ts             # Email sync
│       ├── search.ts           # Server-side search
│       ├── providers.ts        # Provider configs
│       └── auth.ts             # Credential validation
├── storage/
│   ├── database.ts             # SQLite connection
│   ├── migrations.ts           # Schema migrations
│   └── services/               # Data access layer
├── rules/                      # YAML rules engine
└── types/                      # TypeScript types
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SQLITE_DB_PATH` | Path to SQLite database | `./data/intentmail.db` |
| `GMAIL_CLIENT_ID` | Gmail OAuth client ID | - |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth client secret | - |
| `GMAIL_REDIRECT_URI` | Gmail OAuth redirect URI | - |
| `OUTLOOK_CLIENT_ID` | Outlook OAuth client ID | - |
| `OUTLOOK_CLIENT_SECRET` | Outlook OAuth client secret | - |
| `OUTLOOK_REDIRECT_URI` | Outlook OAuth redirect URI | - |

See `.env.example` for full list.

## Security

- **OAuth tokens**: Stored encrypted in local SQLite database
- **IMAP passwords**: Encrypted with AES-256-CBC (key derived from machine ID)
- **No cloud storage**: All data remains on local machine
- **Audit logging**: All email operations are logged for transparency

## Links

- [MCP Specification](https://modelcontextprotocol.io/)
- [IntentMail Architecture](./README.md#architecture)
- [Contributing](./CONTRIBUTING.md)
