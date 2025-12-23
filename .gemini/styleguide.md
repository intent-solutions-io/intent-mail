# IntentMail Code Style Guide

**For:** Gemini Code Assist automated reviews
**Project:** IntentMail - MCP email gateway with rules-as-code
**Status:** Phase 2 (Planning) → Phase 3 (Implementation)

---

## Project Context

IntentMail provides an MCP (Model Context Protocol) interface over Gmail, Outlook, and IMAP with:
- **Programmatic email access** for AI assistants (Claude Code)
- **Auditable workflows** with plan/audit/rollback capabilities
- **Local-first control** using SQLite FTS5 storage
- **Delta sync** via provider-native APIs (Gmail historyId, Outlook deltaLink)

**Tone:** Straightforward, casual, no marketing hype. We're in active development - be honest about what exists vs. planned.

---

## Architecture Priorities

### 1. Provider Abstraction (E2)
- **Canonical Mail Model** abstracts Gmail labels, Outlook folders, IMAP folders
- All provider connectors implement `Connector` interface
- Capability flags for provider-specific features (labels, threads, delta sync)

**Review for:**
- Leaky abstractions (provider-specific logic in MCP tools)
- Missing capability checks before using features
- Inconsistent field mappings across providers

### 2. Security-First (Critical)
- **OAuth 2.0** only - no password storage
- **Encrypted token storage** (AES-256, OS keychain)
- **Least-privilege scopes** per provider
- **Input validation** on all MCP tools (Zod schemas)
- **PII sanitization** in logs (redact emails, tokens, content)

**Review for:**
- Hardcoded secrets (API keys, tokens, passwords)
- Missing input validation
- Unsanitized logs containing email content or PII
- OAuth implementations without PKCE
- Token storage in plaintext

### 3. Gmail/Outlook PRIMARY (Phase 2 Update)
- Gmail and Outlook are **V1 PRIMARY** connectors (equal priority)
- IMAP is **SECONDARY** (basic fallback)
- Fastmail is **OPTIONAL** (may defer to V2)

**Review for:**
- Code comments mentioning "Gmail only" or "Gmail-first"
- Missing Outlook delta query implementation
- Outlook folder logic missing when Gmail label logic present

### 4. Delta Sync Efficiency
- **Gmail:** Use History API with `historyId` tracking per mailbox
- **Outlook:** Use Microsoft Graph `/delta` with `deltaLink`/`deltaToken`
- **IMAP:** UID-based polling (no native delta support)

**Review for:**
- Full mailbox scans instead of delta queries
- Missing historyId/deltaLink persistence
- Inefficient sync strategies

---

## Code Standards

### TypeScript/Node.js (MCP Server, Connectors)

**Style:**
- Strict TypeScript mode (`strict: true`, `noImplicitAny: true`)
- ESLint + Prettier for formatting
- Functional style preferred (avoid classes unless necessary)
- Error handling: explicit Result types or try/catch with logging

**File Organization:**
```
src/
├── mcp/              # MCP server + tool definitions
├── connectors/       # Provider implementations
│   ├── gmail/
│   ├── outlook/
│   ├── imap/
│   └── framework/    # Connector interface + base classes
├── sync/             # Delta sync engine
├── rules/            # Rules-as-code engine
├── storage/          # SQLite + FTS5 layer
└── utils/            # Shared utilities
```

**Review for:**
- Missing type annotations
- `any` types without justification
- Unhandled promise rejections
- Missing error boundaries in async functions

### Go (Fastmail/JMAP Connector - Optional)

**Style:**
- `gofmt` for formatting
- Error handling: always check errors, wrap with context
- Contexts: pass `context.Context` for cancellation
- Defer cleanup: `defer file.Close()`

**Review for:**
- Ignored errors (`err` assigned but not checked)
- Missing context propagation
- Goroutine leaks (missing cancellation)

### Python (Scrapers/Automation - Not in V1)

**Style:**
- PEP 8 compliance
- Type hints for function signatures
- `black` for formatting

---

## MCP Tool Contracts (E7)

**Critical:** MCP tools are the **public API** for Claude Code users. Changes are **breaking changes**.

**Standards:**
- All inputs validated with Zod schemas
- All outputs match documented schemas
- Error responses include actionable messages
- Idempotent operations where possible

**Review for:**
- Schema drift (input/output doesn't match spec in `262-AT-APIS-mcp-tool-contract.md`)
- Missing validation on user inputs
- Non-idempotent operations (e.g., `send_email` without deduplication)
- Error messages that expose internals (stack traces, file paths)

### Example MCP Tool (search_emails)
```typescript
import { z } from 'zod';

const SearchEmailsInput = z.object({
  query: z.string().min(1).max(500),
  folder: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export async function searchEmails(input: unknown) {
  // 1. Validate input
  const params = SearchEmailsInput.parse(input);

  // 2. Sanitize query for SQL injection
  const sanitizedQuery = sanitizeQuery(params.query);

  // 3. Execute search with capability checks
  const results = await storage.search({
    query: sanitizedQuery,
    folder: params.folder,
    limit: params.limit,
    offset: params.offset,
  });

  // 4. Return validated output
  return SearchEmailsOutput.parse(results);
}
```

**Review for:**
- Missing `z.parse()` on inputs
- Direct use of user input in SQL queries
- Missing output schema validation

---

## Provider Connector Standards (E4)

### Connector Interface
All connectors implement:
```typescript
interface Connector {
  capabilities: Capabilities;
  authenticate(): Promise<void>;
  sync(lastSyncToken?: string): Promise<SyncResult>;
  getThread(threadId: string): Promise<Thread>;
  getMessages(messageIds: string[]): Promise<Message[]>;
  applyLabel(messageId: string, label: string): Promise<void>;
  send(message: MessageDraft): Promise<SentMessage>;
}
```

**Review for:**
- Connector implementations missing required methods
- Methods throwing "not implemented" errors without capability flags
- Capability flags missing for optional features

### Gmail Connector (E4.2 - PRIMARY)
- **OAuth 2.0** with device flow + local callback
- **History API** for delta sync (track `historyId` per mailbox)
- **Batch requests** where possible (50 messages/request)
- **Rate limits:** Exponential backoff for `429` errors

**Review for:**
- Full mailbox scans instead of History API
- Missing backoff on rate limits
- Hardcoded OAuth credentials (should be env vars or Secret Manager)

### Outlook Connector (E4.3 - PRIMARY)
- **Microsoft Identity Platform** OAuth 2.0
- **Microsoft Graph API** `/delta` endpoint for incremental sync
- **Folder abstraction** to match Gmail label UX
- **Tenant support** for organizational accounts

**Review for:**
- Missing delta query implementation (`/delta` endpoint)
- Folder logic that doesn't align with Gmail label logic
- Tenant-specific logic without configuration option

### IMAP Connector (E4.4 - SECONDARY)
- **UID-based polling** (no native delta support)
- **Basic operations** only (no labels, limited threading)
- **Capability detection** (`CAPABILITY` command)

**Review for:**
- Over-engineering (IMAP is a basic fallback, not full-featured)
- Missing UID persistence (leads to duplicate processing)

---

## Rules Engine (E6)

**Standards:**
- YAML-based rule definitions
- Dry-run mode (plan before apply)
- Audit logging (all actions logged to SQLite)
- Rollback capability (undo actions via audit log)

**Example Rule:**
```yaml
name: Archive old newsletters
description: Move newsletters older than 30 days to Archive
trigger:
  event: scheduled
  cron: "0 2 * * *"  # Daily at 2am
conditions:
  - field: from
    operator: contains
    value: "@newsletter.com"
  - field: date
    operator: older_than
    value: 30d
actions:
  - type: apply_label
    label: Archive
  - type: mark_read
audit: true
dry_run: false
```

**Review for:**
- Rules executing without dry-run option
- Missing audit logging
- Actions that can't be rolled back (e.g., permanent delete without confirming)

---

## Logging and Observability

**Standards:**
- Structured JSON logs (use `pino` or `winston` in Node.js)
- Log levels: `error`, `warn`, `info`, `debug`, `trace`
- **PII sanitization:** Redact email addresses, content, tokens

**Example:**
```typescript
logger.info({
  action: 'sync_completed',
  provider: 'gmail',
  mailbox: sanitize(mailboxId),  // Hash or truncate
  messagesProcessed: count,
  duration: elapsed,
});

// ❌ NEVER log:
logger.error({ token: oauthToken });  // Exposes credentials
logger.info({ emailBody: content });  // Exposes PII
```

**Review for:**
- Logs containing OAuth tokens
- Logs containing email content or subject lines
- Logs containing email addresses (unless hashed)

---

## Testing Expectations

**Unit Tests:**
- All MCP tools have input validation tests
- All connectors have mock provider tests
- Edge cases: empty results, rate limits, auth failures

**Integration Tests:**
- Real provider accounts (use dedicated test accounts)
- OAuth flow end-to-end
- Delta sync with real API responses

**Review for:**
- Missing tests for error cases
- Tests using production credentials
- Tests that don't clean up resources

---

## Documentation Standards

**Inline Comments:**
- Required for complex logic or non-obvious decisions
- Required for security-critical sections
- NOT required for self-explanatory code

**Function Documentation:**
```typescript
/**
 * Syncs emails from Gmail using History API delta sync.
 *
 * @param mailboxId - Gmail mailbox identifier
 * @param lastHistoryId - Last synced historyId (optional, full sync if omitted)
 * @returns SyncResult with new messages and updated historyId
 * @throws {AuthError} if OAuth token expired
 * @throws {RateLimitError} if Gmail API rate limit hit
 */
export async function syncGmail(
  mailboxId: string,
  lastHistoryId?: string
): Promise<SyncResult> {
  // ...
}
```

**Review for:**
- Missing JSDoc/TSDoc on public functions
- Outdated comments (code changed but comment didn't)

---

## Phase-Specific Guidance

### Phase 2 (Current): Epic Planning Complete
- Review planning documents for consistency (not code)
- Check Beads epic structure (16 epics, 81 tasks)
- Validate epic dependency order in Mermaid diagram

### Phase 3 (Next): Implementation Begins
- Enforce strict typing in all new TypeScript code
- Require unit tests for all new MCP tools
- OAuth flows must be tested end-to-end before PR merge

### Phase 4+: Production Readiness
- All TODOs resolved or converted to GitHub issues
- No hardcoded credentials or test data
- All secrets in Secret Manager (not env vars)

---

## Review Tone and Style

**Good Review Comments:**
- ✅ "Consider using Gmail History API here instead of full mailbox scan for better performance"
- ✅ "This log statement exposes email content - please sanitize before logging"
- ✅ "Missing input validation on `folderId` - could allow path traversal"

**Avoid:**
- ❌ "This is wrong" (not constructive)
- ❌ "You should know better" (condescending)
- ❌ Nitpicking formatting (let Prettier handle it)

**Gemini's Role:**
- Focus on security, correctness, performance
- Flag missing error handling, validation, sanitization
- Suggest better approaches when obvious
- Don't comment on style (ESLint/Prettier handle that)

---

## Quick Reference

| Area | Priority | Review Focus |
|------|----------|--------------|
| Security | Critical | No secrets, input validation, PII sanitization |
| Gmail/Outlook | High | Delta sync, rate limits, OAuth 2.0 |
| MCP Tools | High | Schema validation, idempotency, error messages |
| Provider Abstraction | Medium | Canonical model adherence, capability flags |
| Rules Engine | Medium | Dry-run, audit logging, rollback |
| Logging | Medium | Structured logs, no PII, appropriate levels |
| Tests | Low | Edge cases, error handling, cleanup |

---

**Last Updated:** 2025-12-23 (Phase 2 complete, Phase 3 starting)
