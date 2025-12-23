## Task Tracking (Beads / bd)
- Use `bd` for ALL tasks/issues (no markdown TODO lists).
- Start of session: `bd ready`
- Create work: `bd create "Title" -p 1 --description "Context + acceptance criteria"`
- Update status: `bd update <id> --status in_progress`
- Finish: `bd close <id> --reason "Done"`
- End of session: `bd sync` (flush/import/export + git sync)
- Manual testing safety:
  - Prefer `BEADS_DIR` to isolate a workspace if needed. (`BEADS_DB` exists but is deprecated.)

### Beads upgrades
- After upgrading `bd`, run: `bd info --whats-new`
- If `bd info` warns about hooks, run: `bd hooks install`

---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Last Updated:** 2025-12-23
**System Status:** Phase 2 Complete - MCP Server Foundation Ready

## Current Status
- **Release:** v0.1.0 - MCP Server Foundation
- **Branch:** feat/mcp-server-foundation
- **Phase:** Phase 2 Complete (Infrastructure + MCP Foundation)
- **Next:** Phase 3 Implementation (SQLite, Gmail/Outlook connectors, Rules engine)

## Project Overview

**IntentMail** is a modern email stack with MCP interface layer for programmable, auditable email workflows.

### Core Features
- **MCP Server**: Model Context Protocol interface for AI assistant integration
- **Gmail Connector**: PRIMARY - OAuth + History API delta sync
- **Outlook Connector**: PRIMARY - Graph API /delta endpoint
- **Rules Engine**: YAML-based automation with dry-run, audit, rollback
- **SQLite Storage**: Local-first with FTS5 full-text search
- **Privacy-First**: No password storage, OAuth only, local data storage

### Technology Stack
- **Runtime**: Node.js 20 (LTS)
- **Language**: TypeScript (strict mode)
- **MCP SDK**: @modelcontextprotocol/sdk ^0.5.0
- **Storage**: SQLite with better-sqlite3
- **Validation**: Zod schemas for all inputs/outputs
- **Deployment**: Docker + Google Cloud Run
- **Infrastructure**: Terraform (GCP project: mail-with-intent)

## Repository Structure

```
intent-mail/
├── src/                          # TypeScript source code
│   ├── index.ts                 # MCP server entry point
│   └── mcp/
│       └── tools/
│           └── health.ts        # Health check tool (first working tool)
├── infra/                       # Terraform infrastructure as code
│   ├── main.tf                  # GCP resources (Cloud Run, Artifact Registry, WIF)
│   ├── variables.tf             # Configurable parameters
│   └── outputs.tf               # WIF provider, service account details
├── .github/workflows/           # CI/CD pipelines
│   ├── ci.yml                   # Lint, typecheck, test on PRs
│   ├── deploy.yml               # Cloud Run deployment (WIF, no keys)
│   ├── drift.yml                # Terraform drift detection
│   └── ai-review-vertex.yml     # Future Vertex AI PR reviews
├── .gemini/                     # Gemini Code Assist configuration
│   ├── config.yaml              # Review rules (security, OAuth, rate limits)
│   └── styleguide.md            # IntentMail coding standards
├── .beads/                      # Beads task tracking database
│   └── issues.jsonl             # Task data (16 epics, 81 tasks)
├── package.json                 # MCP server dependencies
├── tsconfig.json                # TypeScript strict mode config
├── Dockerfile                   # Multi-stage production build
├── MCP_SERVER.md                # MCP server usage guide
├── README.md                    # Project overview
├── SETUP.md                     # Infrastructure setup guide
├── SECURITY.md                  # Vulnerability reporting
├── CONTRIBUTING.md              # Contributor guidelines
└── CODE_OF_CONDUCT.md           # Community standards
```

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Development (watch mode)
npm run dev

# Type checking
npm run typecheck

# Build
npm run build

# Production
npm start
```

### Testing with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "intentmail": {
      "command": "node",
      "args": ["/home/jeremy/000-projects/intentmail-clean/dist/index.js"]
    }
  }
}
```

Then restart Claude Desktop and verify with:
```
Use the health_check tool
```

### Task Management with Beads

```bash
# See all tasks
bd list

# See task details
bd show <id>

# Create new task
bd create "Feature: Gmail OAuth flow" -p 1 --description "Implement Gmail OAuth with PKCE"

# Update task status
bd update <id> --status in_progress

# Close task
bd close <id> --reason "Implemented Gmail OAuth with PKCE"

# Sync at end of session
bd sync
```

## Infrastructure & Deployment

### GCP Resources
- **Project ID**: mail-with-intent
- **Project Number**: 230890547974
- **Region**: us-central1
- **Artifact Registry**: us-central1-docker.pkg.dev/mail-with-intent/intentmail
- **Service Account**: intentmail-deployer@mail-with-intent.iam.gserviceaccount.com

### Workload Identity Federation (Keyless CI/CD)
```bash
# No service account keys - uses OIDC tokens
WIF_PROVIDER: projects/230890547974/locations/global/workloadIdentityPools/github-pool/providers/github-provider
DEPLOYER_SA: intentmail-deployer@mail-with-intent.iam.gserviceaccount.com
```

### Terraform Operations

```bash
cd infra/

# Initialize
terraform init

# Plan changes
terraform plan

# Apply changes
terraform apply

# Get output values
terraform output -raw wif_provider
terraform output -raw deployer_service_account
```

### Deployment Pipeline

1. **PR Created** → CI runs (lint, typecheck, test)
2. **Gemini Review** → Automated code review with security checks
3. **PR Merged** → deploy.yml builds Docker image → pushes to Artifact Registry → deploys to Cloud Run
4. **Drift Detection** → Runs daily to check for infrastructure changes

## Architecture Principles

### 1. Provider Abstraction
- **Primary Providers**: Gmail and Outlook (equal priority)
- Abstract common operations: `search`, `get_thread`, `apply_label`, `send`
- Provider-specific code isolated in `/connectors/gmail/` and `/connectors/outlook/`
- Shared interfaces in `/types/`

### 2. Security-First
- **OAuth Only**: No passwords, ever
- **PKCE Required**: All OAuth flows use PKCE
- **Local Storage**: SQLite database stored locally, not in cloud
- **Token Security**: Encrypted token storage with user keychain integration
- **Rate Limiting**: Exponential backoff for Gmail/Outlook API calls
- **Audit Logging**: All email operations logged for transparency

### 3. Delta Sync Strategy
- **Gmail**: Use History API with `historyId` for incremental sync
- **Outlook**: Use Graph API `/delta` endpoint with `deltaLink` and `deltaToken`
- **Storage**: Track sync state in SQLite (`last_history_id`, `delta_token`)
- **Efficiency**: Only fetch changed emails, not full mailbox

### 4. Rules-as-Code
- **YAML Format**: Human-readable automation rules
- **Dry-Run Mode**: Preview changes before applying
- **Audit Trail**: Log all rule executions with rollback data
- **Rollback**: Undo actions if rules misbehave
- **Safety**: Read-only mode for testing

### 5. MCP Tool Design
- **Zod Validation**: All inputs/outputs validated at runtime
- **Error Handling**: Clear error messages with actionable guidance
- **Type Safety**: Full TypeScript strict mode compliance
- **Documentation**: JSDoc comments for all public APIs

## Gemini Code Assist Integration

### Automated PR Reviews
- **Trigger**: PRs automatically reviewed by Gemini
- **Focus**: Security, correctness, performance, best practices
- **Rules**: IntentMail-specific checks (.gemini/config.yaml)
  - No secrets in commits
  - OAuth security (PKCE, secure token storage)
  - Gmail rate limit handling (exponential backoff)
  - Provider abstraction compliance

### Recent Gemini Fixes
1. **IAM Least Privilege**: Changed `roles/run.admin` → `roles/run.developer`
2. **PII Sanitization**: Removed `/home/jeremy` from task logs
3. **Documentation Links**: Fixed broken cross-references
4. **Dynamic Values**: Replaced hardcoded values with terraform outputs

## Phase Roadmap

### Phase 0-2: COMPLETE
- ✅ GCP infrastructure (Terraform, WIF, Artifact Registry)
- ✅ CI/CD pipelines (ci.yml, deploy.yml, drift.yml)
- ✅ Gemini Code Assist integration
- ✅ MCP server foundation (health_check tool working)
- ✅ TypeScript strict mode configuration
- ✅ Docker multi-stage build

### Phase 3: NEXT (Implementation)
- [ ] SQLite storage + migrations
- [ ] FTS5 full-text search
- [ ] Gmail connector (OAuth, History API, delta sync)
- [ ] Outlook connector (Graph API, /delta endpoint)
- [ ] Email operation tools:
  - `search_emails` - Query with filters (from, subject, date)
  - `get_thread` - Retrieve email thread with full content
  - `apply_label` - Categorize emails
  - `send_email` - Compose and send with attachments
- [ ] Rules engine (YAML automation)
- [ ] Dry-run + audit + rollback

### Phase 4-5: Future
- [ ] Advanced automation (templates, scheduling)
- [ ] Multi-account support
- [ ] Analytics dashboard
- [ ] Additional provider connectors (IMAP/SMTP fallback)

## Coding Standards

### TypeScript Style
- **Strict Mode**: All compiler strict checks enabled
- **Explicit Types**: No implicit `any`, prefer explicit types
- **Null Safety**: Use `strictNullChecks`, handle undefined/null explicitly
- **Unused Variables**: No unused locals or parameters (error, not warning)
- **No Implicit Returns**: All code paths must return value

### File Organization
```typescript
// 1. Imports (external, then internal)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { healthTool } from './mcp/tools/health.js';

// 2. Constants
const SERVER_NAME = 'intentmail-mcp-server';

// 3. Type definitions
interface ServerConfig {
  name: string;
  version: string;
}

// 4. Implementation
async function main() {
  // ...
}
```

### Error Handling
```typescript
// ✅ Good: Specific error handling
try {
  await sendEmail(params);
} catch (error) {
  if (error instanceof RateLimitError) {
    await backoff.exponential();
    return retry();
  }
  throw new MCPError('send_email_failed', error.message);
}

// ❌ Bad: Generic catch-all
try {
  await sendEmail(params);
} catch (error) {
  console.error('Something went wrong');
}
```

### Zod Schema Pattern
```typescript
import { z } from 'zod';

// Input schema (validation)
const SearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().default(50),
});

// Output schema (validation)
const SearchOutputSchema = z.object({
  emails: z.array(EmailSchema),
  total: z.number().int().nonnegative(),
});

// Tool handler
export const searchTool = {
  definition: { /* ... */ },

  handler: async (args: unknown) => {
    const input = SearchInputSchema.parse(args);
    // ... implementation
    const output = SearchOutputSchema.parse(result);
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  },
};
```

## File Management Rules

### NEVER Create
- Files without explicit permission
- Duplicate functionality
- Test/temp files outside of test directories
- Configuration files without clear need

### ALWAYS Maintain
- Clean commit history
- Updated documentation (especially CLAUDE.md)
- Working CI/CD pipelines
- TypeScript type safety

### Read Before Edit
- NEVER propose changes to code you haven't read
- Use Read tool to understand existing code
- Verify assumptions with user if unclear

## Common Tasks

### Adding a New MCP Tool

1. Create tool file: `src/mcp/tools/<tool-name>.ts`
2. Define Zod schemas (input + output)
3. Implement tool definition and handler
4. Export from `src/index.ts`
5. Add to request handler switch statement
6. Test locally with Claude Desktop
7. Update MCP_SERVER.md documentation

### Adding a Provider Connector

1. Create directory: `src/connectors/<provider>/`
2. Implement OAuth flow (PKCE required)
3. Implement delta sync strategy
4. Create abstraction layer in `src/types/`
5. Add provider-specific tests
6. Update README.md with setup instructions

### Deploying Infrastructure Changes

```bash
cd infra/
terraform plan  # Review changes
terraform apply # Apply after approval
cd ..
git add infra/
git commit -m "infra: description of changes"
git push
```

## GitHub Integration

- **Repository**: https://github.com/intent-solutions-io/intent-mail
- **Main Branch**: `main` (protected)
- **Feature Branches**: `feat/<feature-name>`
- **Chore Branches**: `chore/<task-name>`
- **PRs Required**: All changes go through PR review
- **Auto-Review**: Gemini reviews all PRs automatically

## Security

### OAuth Best Practices
- Use PKCE (Proof Key for Code Exchange) for all OAuth flows
- Store tokens encrypted in user's system keychain
- Implement token refresh logic
- Never log access tokens or refresh tokens
- Use state parameter to prevent CSRF

### API Rate Limiting
- Gmail: 250 quota units/user/second (use exponential backoff)
- Outlook: Graph API throttling limits (use retry-after header)
- Implement jitter in backoff to avoid thundering herd

### Data Privacy
- SQLite database stored locally only
- No telemetry or analytics collection
- User data never leaves their machine (except OAuth redirects)
- Clear data deletion mechanisms

## Troubleshooting

### Build Failures
```bash
# Clear node_modules and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
```

### TypeScript Errors
```bash
# Run typecheck to see all errors
npm run typecheck

# Common fixes:
# - Add explicit types to function parameters
# - Handle null/undefined cases
# - Remove unused variables
```

### Deployment Issues
```bash
# Check GitHub secrets
gh secret list --repo intent-solutions-io/intent-mail

# Required secrets:
# - WIF_PROVIDER
# - DEPLOYER_SA

# Verify WIF configuration
gcloud iam workload-identity-pools providers describe github-provider \
  --workload-identity-pool=github-pool \
  --location=global
```

---

**This is production infrastructure. Follow security best practices and test thoroughly before deploying.**
