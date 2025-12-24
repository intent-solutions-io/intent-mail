# IntentMail MCP Server

Model Context Protocol server for programmable email access with Gmail/Outlook connectors.

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

### Phase 1 (Current):
- `health_check` - Verify server is running and check capabilities

### Phase 3 (Planned):
- `search_emails` - Search emails with filters
- `get_thread` - Get email thread by ID
- `apply_label` - Apply label to emails
- `send_email` - Send new email
- `create_rule` - Create automation rule
- `run_plan` - Preview rule changes (dry-run)

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
├── index.ts           # MCP server entry point
├── mcp/
│   └── tools/
│       └── health.ts  # Health check tool
├── storage/           # SQLite + FTS5 (Phase 3)
├── types/             # TypeScript types
└── utils/             # Shared utilities
```

## Configuration

See `.env.example` for available environment variables.

## Phase 3 Roadmap

- [ ] SQLite storage with FTS5 full-text search
- [ ] Gmail connector (OAuth 2.0, History API delta sync)
- [ ] Outlook connector (Microsoft Graph, delta queries)
- [ ] Rules-as-code engine (YAML-based)
- [ ] MCP tools for email operations
- [ ] Audit logging

## Links

- [MCP Specification](https://modelcontextprotocol.io/)
- [IntentMail Architecture](./README.md#architecture)
- [Contributing](./CONTRIBUTING.md)
