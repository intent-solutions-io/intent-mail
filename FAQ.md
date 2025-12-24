# Frequently Asked Questions

## General Questions

### Q: Do I need Claude Desktop to use IntentMail?

**No!** IntentMail is a standard **MCP (Model Context Protocol) server**. It works with:

- ✅ **Claude Desktop** (Anthropic's official client)
- ✅ **Any MCP-compatible client** (see [modelcontextprotocol.io](https://modelcontextprotocol.io))
- ✅ **Your own code** (using MCP SDK for TypeScript/Python)
- ✅ **Terminal/CLI** (direct stdio communication)

**Example: Custom Python Client**

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Connect to IntentMail MCP server
server_params = StdioServerParameters(
    command="node",
    args=["/path/to/intent-mail/dist/index.js"]
)

async with stdio_client(server_params) as (read, write):
    async with ClientSession(read, write) as session:
        # Initialize
        await session.initialize()

        # Call tools
        result = await session.call_tool("mail_search", {
            "query": "meeting",
            "limit": 10
        })

        print(result)
```

**Example: Custom TypeScript Client**

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Connect to IntentMail
const transport = new StdioClientTransport({
  command: 'node',
  args: ['/path/to/intent-mail/dist/index.js']
});

const client = new Client({
  name: 'my-email-bot',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);

// Use tools
const result = await client.callTool({
  name: 'mail_search',
  arguments: { query: 'invoice', limit: 5 }
});

console.log(result);
```

---

## OAuth & Google Cloud Console

### Q: Can I use Gmail without Google Cloud Console?

**No.** Google requires **all** applications using Gmail API to:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable Gmail API
3. Create OAuth 2.0 credentials
4. Set up OAuth consent screen

**This is a Google requirement, not an IntentMail limitation.**

**Why?**
- Security: OAuth prevents password theft
- Permissions: Users explicitly authorize what you can access
- Compliance: Required by Google's Terms of Service

**Is it free?**
- ✅ Yes! Google Cloud Console is free
- ✅ Gmail API quota: 1 billion quota units/day (free tier)
- ✅ No credit card required for personal projects

**Step-by-step guide:** See [README.md](README.md#2-set-up-gmail-oauth-one-time)

### Q: Do I need to deploy to Google Cloud?

**No!** You can run IntentMail:

- ✅ **Locally** (recommended for personal use)
- ✅ **On-premises** (your own server)
- ✅ **Any Docker host** (AWS, Azure, DigitalOcean, etc.)
- ✅ **Raspberry Pi** (ARM64 support)

Google Cloud Console is **only** needed for:
- Creating OAuth credentials (one-time setup)
- Optionally: deploying to Google Cloud Run (not required)

---

## Deployment & Docker

### Q: How do I distribute IntentMail to others?

**Option 1: Docker Hub (Easiest)**

```bash
# 1. Build and push to Docker Hub
docker buildx build --platform linux/amd64,linux/arm64 \
  -t yourusername/intentmail:latest --push .

# 2. Users pull and run
docker pull yourusername/intentmail:latest
docker run -d -v $(pwd)/data:/app/data -v $(pwd)/.env:/app/.env:ro \
  yourusername/intentmail:latest
```

**Option 2: GitHub Release (Source Code)**

```bash
# 1. Create release on GitHub
gh release create v0.1.0 --title "IntentMail v0.1.0"

# 2. Users clone and run
git clone https://github.com/yourusername/intent-mail.git
cd intent-mail
npm install
npm run build
npm start
```

**Option 3: npm Package (Advanced)**

```bash
# Publish as npm package
npm publish
```

### Q: Does Docker require Google Cloud?

**No!** Docker is completely independent of Google Cloud:

- Docker runs on **any** operating system (macOS, Linux, Windows)
- Docker containers can run **anywhere** (local, AWS, Azure, your own server)
- Google Cloud Console is only needed for Gmail OAuth credentials

---

## Data & Privacy

### Q: Where is my email data stored?

**Locally on your machine** in `./data/intentmail.db` (SQLite database).

- ✅ No cloud storage
- ✅ No external servers (except Gmail/Outlook APIs)
- ✅ Full control over your data
- ✅ Can be backed up, encrypted, or deleted at any time

### Q: What about OAuth tokens?

**Currently stored in SQLite (plaintext).** Future versions will encrypt tokens using OS keychain:

- macOS: Keychain Access
- Linux: gnome-keyring or kwallet
- Windows: Credential Manager

**For now:** Protect `./data/intentmail.db` file permissions:

```bash
chmod 600 ./data/intentmail.db
```

### Q: Can I use this on multiple computers?

**Yes!** But be careful:

- ✅ Sync `./data/intentmail.db` file between computers (Dropbox, Syncthing, etc.)
- ⚠️  Don't run simultaneously on multiple computers (database locking issues)
- ✅ Or: Create separate accounts per computer

---

## Features & Limitations

### Q: What email providers are supported?

**Current:**
- ✅ Gmail (OAuth 2.0 + History API delta sync)

**Planned:**
- 🚧 Outlook (Graph API delta sync) - code exists, needs OAuth testing
- 🚧 IMAP/SMTP (fallback for other providers)

### Q: Can I automate emails with rules?

**Yes!** IntentMail has a full rules engine:

```yaml
# Example: Auto-archive newsletters
name: "Archive Newsletters"
trigger: on_new_email
conditions:
  - field: from
    operator: contains
    value: newsletter
actions:
  - type: archive
  - type: mark_read
```

**Features:**
- ✅ Dry-run mode (preview changes)
- ✅ Audit log (track all actions)
- ✅ Rollback (undo rule executions)

### Q: Does this replace Gmail/Outlook?

**No!** IntentMail is a **layer on top** of Gmail/Outlook:

- Use Gmail/Outlook normally (web, mobile apps)
- IntentMail provides **programmatic access** for AI assistants
- Changes sync both ways (Gmail is source of truth)

---

## Technical Questions

### Q: What is MCP (Model Context Protocol)?

**MCP** is an open standard for connecting AI assistants to data sources and tools.

Think of it like:
- **HTTP** for web servers
- **SQL** for databases
- **MCP** for AI tool integration

**Learn more:** [modelcontextprotocol.io](https://modelcontextprotocol.io)

### Q: Why stdio instead of HTTP?

MCP servers use **stdio (standard input/output)** because:

1. **Simplicity:** No ports, no HTTP overhead
2. **Security:** No network exposure (local-only by default)
3. **Bi-directional:** Server can send notifications to client
4. **Standard:** Works with any process communication (pipes, Docker exec, SSH)

### Q: Can I use this with LangChain/CrewAI/AutoGPT?

**Yes!** You can:

1. **Use MCP SDK** (recommended):
   - Write a LangChain custom tool that calls MCP
   - Wrap MCP client in CrewAI tool

2. **Direct integration**:
   - Import IntentMail's storage/connector modules
   - Use TypeScript/JavaScript directly

**Example: LangChain Tool**

```python
from langchain.tools import Tool
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class IntentMailTool(Tool):
    name = "email_search"
    description = "Search emails"

    async def _arun(self, query: str):
        server_params = StdioServerParameters(
            command="node",
            args=["/path/to/intent-mail/dist/index.js"]
        )

        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool("mail_search", {"query": query})
                return result
```

---

## Troubleshooting

### Q: "Database is locked" error

**Cause:** Multiple processes accessing SQLite simultaneously.

**Fix:**

```bash
# Stop all IntentMail processes
pkill -f intentmail

# Remove lock files
rm ./data/intentmail.db-shm ./data/intentmail.db-wal

# Restart
npm start
```

### Q: OAuth authorization times out

**Cause:** OAuth callback server didn't receive authorization code.

**Fix:**

1. Check if port 3000 is available:
   ```bash
   lsof -i :3000
   ```

2. Use manual mode:
   ```bash
   # Get auth URL
   Use mail_auth_start with manualMode: true

   # Open URL in browser, authorize, copy code from URL

   # Complete manually
   Use mail_auth_complete with code
   ```

### Q: TypeScript errors after updating

```bash
# Clear build cache
rm -rf dist/ node_modules/
npm install
npm run build
```

---

## Contributing & Support

### Q: How do I report bugs?

**Option 1: GitHub Issues**
```bash
gh issue create --title "Bug: ..." --body "..."
```

**Option 2: Beads Task Tracking**
```bash
bd create "Bug: ..." -p 1 --description "..."
```

### Q: Can I add a new email provider?

**Yes!** See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Provider connector architecture
- OAuth flow implementation
- Delta sync strategy
- Testing requirements

---

## Pricing & Licensing

### Q: Is IntentMail free?

**Yes!** IntentMail is open source (license TBD, likely MIT or Apache 2.0).

**Costs:**
- IntentMail: Free
- Google Cloud Console: Free (for personal use)
- Gmail API: Free (1 billion quota units/day)
- Claude Desktop: Free tier available

### Q: Can I use this commercially?

**Yes** (once license is finalized). Planned licensing:

- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Private use allowed
- ⚠️  Attribution required
- ⚠️  Liability disclaimer

---

## Roadmap

### Q: What's next for IntentMail?

**Phase 3 (Current):**
- ✅ SQLite storage + FTS5 search
- ✅ Rules engine + audit log
- 🚧 Gmail connector (OAuth needs testing)
- 🚧 Outlook connector (OAuth needs testing)

**Phase 4 (Next):**
- Real-time sync (push notifications)
- Background sync daemon
- Multi-account support
- Rule scheduling (cron-like)

**Phase 5 (Future):**
- Web UI (Svelte/React)
- Analytics dashboard
- IMAP connector (fallback)
- Mobile app (React Native)

---

**More questions?** Open an issue or check the [documentation](./000-docs/).
