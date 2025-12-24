# IntentMail

Modern email stack with MCP interface layer for programmable, auditable email workflows.

## Why We're Building This

Managing email with Gmail or Outlook is painful when you need:
- **Programmatic access** for automation and AI assistants
- **Auditable workflows** (know what changed, when, and be able to rollback)
- **Local-first control** without vendor lock-in

IntentMail provides an MCP server layer over Gmail/Outlook/IMAP, plus rules-as-code with plan/audit/rollback capabilities.

## Status

**In active development** - not production-ready.

**What exists today:**
- Phase 1: Project scaffolding + documentation (6 docs, ~12K words)
- Phase 2: Epic planning + Beads dependency graph (16 epics, 81 tasks, 6 planning docs)
- Filing system compliant (Document Filing System Standard v4.2)
- Gmail + Outlook prioritized as V1 PRIMARY connectors

**Planned next:**
- Phase 3: Implementation (E1-E11 epics)
- See `completed-docs/intent-mail/000-docs/` for detailed specs

## Cloud Requirements

**Local development does NOT require Google Cloud.**

Run the MCP server locally with:
- Node.js + TypeScript
- SQLite database (local file)
- OAuth credentials (obtained once during setup)

**Deployment uses Google Cloud Platform:**
- **Cloud Run** for production MCP server hosting
- **Artifact Registry** for container images
- **Workload Identity Federation** for keyless CI/CD
- **Optional:** Vertex AI for automated PR code reviews (label-triggered)

See [SETUP.md](SETUP.md) for configuration details.

## Planned Capabilities

- **MCP Tools:** 10+ Claude Code tools for email operations (search, get thread, apply label, send, create rule, etc.)
- **Provider Connectors:**
  - Gmail (PRIMARY) - History API delta sync, multi-label support, OAuth 2.0
  - Outlook (PRIMARY) - Microsoft Graph delta queries, folder abstraction, tenant support
  - IMAP (SECONDARY) - Basic fallback for generic providers
  - Fastmail (OPTIONAL) - JMAP support may be deferred to V2
- **Rules-as-Code:** YAML-based automation with dry-run plan, audit logging, and rollback
- **Local-First:** SQLite storage with FTS5 full-text search
- **Delta Sync:** Efficient incremental sync using provider-native APIs (Gmail historyId, Outlook deltaLink)

## Non-Goals

- **Not production-ready** - no SLA, no uptime guarantees
- **Not full email hosting** - we're a programmable layer over existing providers
- **Not mobile apps** (Phase 1) - CLI/MCP server focus first
- **Not enterprise SSO** (Phase 1) - OAuth 2.0 local-first flows only

## Quickstart

**Not yet runnable.** Implementation starts in Phase 3.

For planning documents and architecture:
```bash
cd completed-docs/intent-mail/000-docs/
ls -1 *.md
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Claude Code / MCP Client            │
└───────────────────┬─────────────────────────────┘
                    │ MCP Protocol
┌───────────────────▼─────────────────────────────┐
│           IntentMail MCP Server (E7)             │
│  ┌──────────────────────────────────────────┐   │
│  │  Tools: search, get_thread, apply_label, │   │
│  │         send, create_rule, run_plan      │   │
│  └──────────────────┬───────────────────────┘   │
└─────────────────────┼───────────────────────────┘
                      │
┌─────────────────────▼─────────────────────────────┐
│          Connector Framework (E3)                  │
│  ┌────────────┬─────────────┬──────────────────┐  │
│  │  Gmail     │  Outlook    │  IMAP/Fastmail   │  │
│  │  (E4.2)    │  (E4.3)     │  (E4.4/E4.1)     │  │
│  │  PRIMARY   │  PRIMARY    │  SECONDARY/OPT   │  │
│  └─────┬──────┴──────┬──────┴──────┬───────────┘  │
└────────┼─────────────┼─────────────┼──────────────┘
         │             │             │
┌────────▼─────────────▼─────────────▼──────────────┐
│   Sync + Index Layer (E5): SQLite + FTS5          │
│   Rules Engine (E6): YAML rules + audit log       │
└───────────────────────────────────────────────────┘
```

**Detailed architecture:** See `completed-docs/intent-mail/000-docs/261-AT-ARCH-intentmail-architecture-overview.md`

## Security

**Secure-by-default goals:**
- OAuth 2.0 flows (no password storage)
- Encrypted token storage (AES-256, OS keychain)
- Least-privilege scopes
- Audit logging for all rule actions
- Input validation on all MCP tools

**No compliance certifications** (development phase).

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- How to run lint/tests
- PR expectations
- Where specs live
- How to add connectors

## License

TBD - to be determined once project reaches beta.

## Project Tracking

- **Beads Epic Root:** `ai-devops-intent-solutions-b76`
- **Total Epics:** 16 (11 main + 5 provider sub-epics)
- **Total Tasks:** 81 child tasks
- **Documentation:** `completed-docs/intent-mail/000-docs/`
