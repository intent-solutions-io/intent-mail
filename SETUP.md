# IntentMail Setup Guide

**Status:** Phase 2 complete, Phase 3 implementation starting
**Last Updated:** 2025-12-23

---

## Quick Start

This project uses a keyless CI/CD pipeline with Workload Identity Federation (WIF) for secure GitHub Actions → Google Cloud deployments.

### Prerequisites

- GitHub repository: `intent-solutions-io/intent-mail`
- GCP project: `mail-with-intent` (already created)
- Admin access to both GitHub repo and GCP project

---

## 1. GitHub Secrets Configuration

Add these secrets to your GitHub repository:

**Location:** `https://github.com/intent-solutions-io/intent-mail/settings/secrets/actions`

### Required Secrets

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `WIF_PROVIDER` | Get from `cd infra && terraform output -raw wif_provider` | Workload Identity Federation provider |
| `DEPLOYER_SA` | Get from `cd infra && terraform output -raw deployer_service_account` | Service account for deployments |

**Note:** `GCP_PROJECT_ID` and `ARTIFACT_REGISTRY` are hardcoded in workflows (not secrets).

### How to Add Secrets

1. Get secret values from Terraform:
   ```bash
   cd infra
   terraform output -raw wif_provider
   terraform output -raw deployer_service_account
   ```

2. Go to repository settings: `https://github.com/intent-solutions-io/intent-mail/settings/secrets/actions`
3. Click **New repository secret**
4. Add `WIF_PROVIDER` with the value from terraform output
5. Click **Add secret**
6. Repeat for `DEPLOYER_SA`

---

## 2. Gemini Code Assist Setup

### Install Gemini Code Assist GitHub App

Gemini Code Assist provides automated code reviews on pull requests.

**Installation Steps:**

1. **Install the GitHub App:**
   - Go to: `https://github.com/apps/google-cloud-gemini-code-assist`
   - Click **Install**
   - Select organization: `intent-solutions-io`
   - Select repository: `intent-mail`
   - Grant required permissions (read code, write comments on PRs)

2. **Link to Google Cloud Project:**
   - Go to: `https://console.cloud.google.com/marketplace/product/google/codeassist.googleapis.com`
   - Select project: `mail-with-intent`
   - Enable **Gemini Code Assist API**
   - Link GitHub app to project (follow prompts)

3. **Verify Installation:**
   - Open any PR in the repository
   - Comment: `/gemini review`
   - Gemini should respond with automated code review

### Configuration Files

Already created in this repository:
- `.gemini/config.yaml` - Review settings, severity thresholds, file patterns
- `.gemini/styleguide.md` - IntentMail-specific code standards and review guidance

### Trigger Reviews

**Automatic:** Gemini reviews all PRs automatically when app is installed

**Manual:** Comment `/gemini review` on any PR to trigger immediate review

---

## 3. Verify CI/CD Pipeline

### Test CI Workflow

CI runs automatically on all PRs and pushes to `main`:

```bash
# Create a test PR
git checkout -b test/ci-verification
echo "# Test" > TEST.md
git add TEST.md
git commit -m "test: verify CI pipeline"
git push origin test/ci-verification

# Open PR on GitHub
# CI workflow should run automatically
```

### Test Deploy Workflow

Deploy workflow runs on pushes to `main`:

**Note:** Deployment will be skipped until Dockerfile exists (Phase 3 implementation).

```bash
# Merge a PR to main
# Deploy workflow runs automatically
# Check: https://github.com/intent-solutions-io/intent-mail/actions
```

### Test Drift Detection

Drift detection runs daily at 9am UTC, but can be triggered manually:

```bash
# Go to: https://github.com/intent-solutions-io/intent-mail/actions/workflows/drift.yml
# Click "Run workflow" → "Run workflow"
# Check results in Actions tab
```

---

## 4. Infrastructure Management

### View Current Infrastructure

```bash
cd infra

# Initialize Terraform
terraform init

# View planned infrastructure
terraform plan
```

### Import Existing Resources

Resources were created manually via `gcloud`. Import them into Terraform state:

```bash
cd infra

# Import resources (run each command)
terraform import google_artifact_registry_repository.intentmail projects/mail-with-intent/locations/us-central1/repositories/intentmail
terraform import google_service_account.deployer projects/mail-with-intent/serviceAccounts/intentmail-deployer@mail-with-intent.iam.gserviceaccount.com
terraform import google_iam_workload_identity_pool.github projects/mail-with-intent/locations/global/workloadIdentityPools/github-pool
terraform import google_iam_workload_identity_pool_provider.github projects/mail-with-intent/locations/global/workloadIdentityPools/github-pool/providers/github-provider

# Verify state
terraform plan  # Should show no changes
```

### Make Infrastructure Changes

```bash
cd infra

# Edit main.tf, variables.tf, etc.

# Review changes
terraform plan

# Apply changes
terraform apply
```

---

## 5. Development Workflow

### Branch Naming

```
<type>/<short-description>
```

Examples:
- `feat/gmail-connector`
- `fix/oauth-token-refresh`
- `docs/mcp-tool-examples`
- `test/rules-engine-audit`

### PR Process

1. **Create feature branch** from `main`
2. **Make changes** and commit
3. **Push branch** to GitHub
4. **Open PR** against `main`
5. **CI runs automatically** (lint, typecheck, tests)
6. **Gemini reviews automatically** (security, correctness, best practices)
7. **Address feedback** from CI and Gemini
8. **Human review** required before merge
9. **Merge to main** triggers deployment (when implementation exists)

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

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

---

## 6. Security Best Practices

### Do NOT Commit

- API keys, OAuth tokens, passwords
- Service account keys, private keys
- Test account credentials
- PII (real email addresses, names, etc.)

### Do Include

- Input validation for all user inputs
- Output sanitization in logs (redact tokens, emails)
- Safe defaults (least privilege, fail closed)

### Secrets Management

- **Development:** Use `.env` files (add to `.gitignore`)
- **Production:** Use Google Secret Manager
- **CI/CD:** Use GitHub Secrets (WIF only, no service account keys)

---

## 7. Troubleshooting

### CI/CD Issues

**Problem:** CI workflow fails with "WIF_PROVIDER not found"
**Solution:** Add GitHub secrets (see section 1 above)

**Problem:** Deploy workflow fails with authentication error
**Solution:** Verify WIF provider and service account bindings:
```bash
gcloud iam service-accounts get-iam-policy \
  intentmail-deployer@mail-with-intent.iam.gserviceaccount.com \
  --project=mail-with-intent
```

### Gemini Code Assist Issues

**Problem:** Gemini not responding to `/gemini review`
**Solution:**
1. Verify GitHub App is installed: `https://github.com/organizations/intent-solutions-io/settings/installations`
2. Verify Gemini API is enabled: `https://console.cloud.google.com/apis/library/codeassist.googleapis.com?project=mail-with-intent`

**Problem:** Gemini reviews are too noisy (too many low-severity comments)
**Solution:** Edit `.gemini/config.yaml` and set `severity.low: false`

### Infrastructure Issues

**Problem:** Terraform drift detected
**Solution:** See `infra/README.md` for drift resolution steps

**Problem:** `terraform plan` shows unexpected changes
**Solution:** Run `terraform refresh` to sync state with GCP

---

## 8. Next Steps (Phase 3)

When implementation begins:

1. **Create MCP Server:**
   - Add `package.json` with TypeScript, ESLint, Prettier
   - Create `src/mcp/` directory structure
   - Implement first MCP tool (`health_check`)

2. **Add Dockerfile:**
   - Multi-stage build for Node.js
   - Deploy workflow will automatically build and deploy

3. **Create Tests:**
   - Add Vitest or Jest for unit tests
   - CI workflow will automatically run tests

4. **OAuth Setup:**
   - Create OAuth credentials in Google Cloud Console (Gmail)
   - Create app registration in Azure AD (Outlook)
   - Store credentials in Secret Manager

---

## Quick Reference

### Useful Links

| Resource | URL |
|----------|-----|
| GitHub Repository | https://github.com/intent-solutions-io/intent-mail |
| GCP Console | https://console.cloud.google.com/?project=mail-with-intent |
| GitHub Actions | https://github.com/intent-solutions-io/intent-mail/actions |
| Artifact Registry | https://console.cloud.google.com/artifacts?project=mail-with-intent |
| Secret Manager | https://console.cloud.google.com/security/secret-manager?project=mail-with-intent |
| Gemini Code Assist | https://console.cloud.google.com/marketplace/product/google/codeassist.googleapis.com |

### Command Cheat Sheet

```bash
# CI/CD
git push origin <branch>                     # Trigger CI on PR
git push origin main                         # Trigger deploy on main

# Infrastructure
cd infra && terraform plan                   # View infrastructure changes
cd infra && terraform apply                  # Apply infrastructure changes
cd infra && terraform output github_secrets  # Get GitHub secret values

# Beads (Task Tracking)
bd list --status open --priority 1,2         # List high-priority tasks
bd show <epic-id>                            # View epic details
bd update <task-id> --status in_progress     # Update task status

# Gemini
/gemini review                               # Trigger manual review on PR
```

---

**Questions?**
- Epic/Task questions: Check Beads (`bd show <epic-id>`) or `completed-docs/intent-mail/000-docs/`
- Architecture questions: See `completed-docs/intent-mail/000-docs/261-AT-ARCH-intentmail-architecture-overview.md`
- General questions: Open a GitHub Discussion
