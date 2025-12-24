# Contributing to IntentMail

Thanks for your interest! IntentMail is in active development - we're building the foundation right now.

## Project Status

**Phase 2 Complete:** Epic planning + specs (16 epics, 81 tasks, docs)
**Phase 3 Starting:** Implementation of connectors, MCP server, rules engine

## Quick Links

- **Project Overview:** See [README.md](README.md) for status and planned capabilities
- **Setup Guide:** See [SETUP.md](SETUP.md) for infrastructure configuration
- **Security:** See [SECURITY.md](SECURITY.md) for vulnerability reporting
- **Beads Tracking:** Use `bd list` to see all epics and tasks (16 epics, 81 tasks planned)

**Note:** Detailed planning documents (epic roadmap, architecture, MCP specs) will be added during Phase 3 implementation.

## How to Contribute

### 1. Pick a Task

Check open tasks in Beads:
```bash
bd list --status open --priority 1,2
```

Or check GitHub Issues/Projects.

### 2. Claim It

Comment on the issue/task to avoid duplicate work.

### 3. Branch Naming

```
<type>/<short-description>
```

Examples:
- `feat/gmail-connector`
- `fix/oauth-token-refresh`
- `docs/mcp-tool-examples`
- `test/rules-engine-audit`

### 4. Code Standards

**When runnable code exists, we'll add:**
- Linting (ESLint/Prettier for TS, gofmt for Go)
- Type checking (TypeScript strict mode)
- Unit tests (Vitest/Jest for TS, go test for Go)
- Integration tests for connectors

**For now:** Follow existing patterns in specs and be consistent.

### 5. PR Expectations

**Before opening a PR:**
- [ ] Lint passes (when linting exists)
- [ ] Tests pass (when tests exist)
- [ ] Docs updated if behavior changes
- [ ] No secrets in code/logs/commits

**PR description should include:**
- What problem does this solve?
- How does it work?
- What epic/task does this close? (Link to Beads ID or GitHub issue)
- Testing: How did you verify it works?

**PR review:**
- Gemini Code Assist will auto-review (focus on security/correctness)
- Human review required before merge
- CI must pass (when CI exists)

### 6. Commit Messages

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `test`: Adding tests
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `chore`: Build process, tooling, dependencies

**Examples:**
```
feat(gmail): implement History API delta sync

- Track historyId per mailbox
- Handle messageAdded, messageDeleted events
- Add backoff for rate limits

Closes: ai-devops-intent-solutions-b76.5.2
```

```
fix(oauth): prevent token refresh race condition

When multiple requests hit expired token simultaneously,
only one should refresh. Others should wait.

Closes: #42
```

### 7. Adding a Connector

If you want to add a new provider connector (e.g., ProtonMail, iCloud):

1. **Check the spec:** `completed-docs/intent-mail/000-docs/262-AT-DSGN-canonical-mail-model.md`
2. **Implement the Connector interface** (E3 framework)
3. **Add capability flags** for features your provider supports
4. **Write integration tests** against a real test account
5. **Document provider quirks** (rate limits, OAuth scopes, API limitations)

### 8. Changing MCP Tool Contracts

MCP tools are the public API for Claude Code users. Changes here are **breaking changes**.

**Before modifying:**
1. Open a discussion/issue explaining why
2. Get maintainer approval
3. Update `262-AT-APIS-mcp-tool-contract.md` spec
4. Implement with backward compatibility if possible
5. Document migration path

### 9. Security

**Do NOT commit:**
- API keys, OAuth tokens, passwords
- Service account keys, private keys
- Test account credentials
- PII (real email addresses, names, etc.)

**Do include:**
- Input validation for all user inputs
- Output sanitization in logs (redact tokens, emails)
- Safe defaults (least privilege, fail closed)

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Development Setup

**Not yet runnable** - coming in Phase 3.

**When ready, this section will include:**
```bash
# Clone repo
git clone https://github.com/intent-solutions-io/intent-mail.git
cd intent-mail

# Install dependencies
npm install  # or go mod download

# Run tests
npm test     # or go test ./...

# Run locally
npm run dev  # or go run ./cmd/server
```

## Architecture Overview

```
MCP Server (E7)
    ↓
Connector Framework (E3)
    ↓
Providers: Gmail (E4.2), Outlook (E4.3), IMAP (E4.4), Fastmail (E4.1)
    ↓
Sync + Index Layer (E5): SQLite + FTS5
    ↓
Rules Engine (E6): YAML rules + audit
```

**Deep dive:** See architecture docs in `completed-docs/intent-mail/000-docs/`

## Questions?

- **Epic/Task questions:** Check Beads (`bd show <epic-id>`) or planning docs
- **Architecture questions:** See `261-AT-ARCH-intentmail-architecture-overview.md`
- **General questions:** Open a GitHub Discussion

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you're expected to uphold this code.

## License

TBD - will be determined before first release.
