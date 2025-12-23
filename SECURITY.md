# Security Policy

## Project Status

IntentMail is **in active development** with no releases yet. This is not production-ready software.

## Reporting Vulnerabilities

We take security seriously, even in development.

### How to Report

**Preferred:** Use GitHub Security Advisories (private disclosure)
1. Go to https://github.com/intent-solutions-io/intent-mail/security/advisories
2. Click "Report a vulnerability"
3. Provide details: affected components, reproduction steps, potential impact

**Alternative:** Create a GitHub issue
- Mark as `security` label
- **Do NOT post secrets, credentials, or exploit code publicly**
- Provide enough detail for us to reproduce

### What to Report

**In scope:**
- Code vulnerabilities (SQL injection, XSS, command injection, etc.)
- Dependency vulnerabilities (npm packages, Docker base images)
- Build pipeline security issues (GitHub Actions, secrets exposure)
- OAuth flow vulnerabilities
- Token storage weaknesses
- Data leakage in logs or error messages

**Out of scope (for now):**
- DoS attacks (no production deployment yet)
- Social engineering
- Physical security

### What to Expect

**No SLA** - this is a development project, but we'll respond as quickly as we can:
- **Acknowledgment:** Within 7 days
- **Initial assessment:** Within 14 days
- **Fix timeline:** Depends on severity and complexity

**Severity levels:**
- **Critical:** Remote code execution, credential theft, data breach
- **High:** Privilege escalation, authentication bypass
- **Medium:** Information disclosure, missing security controls
- **Low:** Best practice violations, hardening opportunities

### Disclosure Policy

- We'll work with you on coordinated disclosure
- We'll credit reporters in release notes (unless you prefer anonymity)
- We reserve the right to disclose issues after 90 days, even if unfixed

## Security Features (Planned)

**When implemented, IntentMail will include:**
- OAuth 2.0 (no password storage)
- Encrypted token storage (AES-256, OS keychain)
- Least-privilege scope requests
- Input validation on all MCP tools
- Audit logging for all rule actions
- Secure defaults (no plaintext credentials, no shell command injection)

**Not yet implemented** - code review carefully!

## Dependencies

We track dependencies with:
- Dependabot alerts (enabled)
- Regular `npm audit` / `go mod` checks in CI

## Build Pipeline Security

- Workload Identity Federation (WIF) for GCP deployments (no service account keys)
- Secrets stored in GitHub Secrets / Google Secret Manager
- No secrets in code, logs, or CI artifacts
- Minimal IAM permissions (least privilege)

## Contact

For security questions: Use GitHub issues with `security` label or Security Advisories.

## Updates

This policy will evolve as the project matures. Last updated: 2025-12-23
