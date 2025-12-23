# IntentMail Infrastructure

Infrastructure as Code (IaC) for IntentMail using Terraform.

## Status

**Phase 2 - Planning Complete**

This infrastructure has been **manually provisioned** via `gcloud` commands during initial setup. The Terraform code here serves as:
1. **Documentation** of the current infrastructure state
2. **Drift detection** baseline (via `.github/workflows/drift.yml`)
3. **Foundation** for future infrastructure changes

## Current Infrastructure

Manually provisioned via `gcloud`:
- **GCP Project**: `mail-with-intent`
- **Artifact Registry**: `us-central1-docker.pkg.dev/mail-with-intent/intentmail`
- **Service Account**: `intentmail-deployer@mail-with-intent.iam.gserviceaccount.com`
- **Workload Identity Pool**: `github-pool`
- **OIDC Provider**: `github-provider` (restricted to `intent-solutions-io` organization)

## Using This Infrastructure

### Import Existing Resources (One-Time Setup)

Since resources were created manually, import them into Terraform state:

```bash
cd infra

# Initialize Terraform
terraform init

# Import existing resources
terraform import google_artifact_registry_repository.intentmail projects/mail-with-intent/locations/us-central1/repositories/intentmail
terraform import google_service_account.deployer projects/mail-with-intent/serviceAccounts/intentmail-deployer@mail-with-intent.iam.gserviceaccount.com
terraform import google_iam_workload_identity_pool.github projects/mail-with-intent/locations/global/workloadIdentityPools/github-pool
terraform import google_iam_workload_identity_pool_provider.github projects/mail-with-intent/locations/global/workloadIdentityPools/github-pool/providers/github-provider

# Verify state matches reality
terraform plan
```

### Making Infrastructure Changes

```bash
cd infra

# Review changes
terraform plan

# Apply changes
terraform apply

# View outputs
terraform output
```

### Drift Detection

Automated drift detection runs daily via `.github/workflows/drift.yml`:
- **Schedule**: Daily at 9am UTC
- **Trigger**: Manual via workflow_dispatch
- **Action**: Creates GitHub issue if drift detected

## GitHub Secrets

Required secrets for CI/CD (already configured):

```bash
# Get values from Terraform outputs
terraform output github_secrets

# Or get directly from GCP
WIF_PROVIDER=projects/230890547974/locations/global/workloadIdentityPools/github-pool/providers/github-provider
DEPLOYER_SA=intentmail-deployer@mail-with-intent.iam.gserviceaccount.com
GCP_PROJECT_ID=mail-with-intent
ARTIFACT_REGISTRY=us-central1-docker.pkg.dev/mail-with-intent/intentmail
```

Add these to GitHub repository secrets:
1. Go to `https://github.com/intent-solutions-io/intent-mail/settings/secrets/actions`
2. Add each secret above

## Remote State (Future)

Currently using local state. To enable remote state:

1. Create GCS bucket:
```bash
gcloud storage buckets create gs://mail-with-intent-terraform-state \
  --project=mail-with-intent \
  --location=us-central1 \
  --uniform-bucket-level-access

gcloud storage buckets update gs://mail-with-intent-terraform-state --versioning
```

2. Uncomment backend configuration in `backend.tf`

3. Migrate state:
```bash
terraform init -migrate-state
```

## Resources Managed

| Resource | Type | Purpose |
|----------|------|---------|
| `google_project_service.apis` | API Enablement | Enable required GCP APIs |
| `google_artifact_registry_repository.intentmail` | Container Registry | Store Docker images |
| `google_service_account.deployer` | Service Account | GitHub Actions deployment identity |
| `google_project_iam_member.deployer_roles` | IAM Bindings | Deployer permissions |
| `google_iam_workload_identity_pool.github` | WIF Pool | GitHub Actions authentication |
| `google_iam_workload_identity_pool_provider.github` | OIDC Provider | GitHub OIDC integration |
| `google_service_account_iam_member.github_wif` | IAM Binding | WIF → Service Account binding |

## Troubleshooting

### Drift Detected
```bash
# Review the drift
cd infra
terraform plan

# Option 1: Apply Terraform to reconcile
terraform apply

# Option 2: Update Terraform to match manual changes
# Edit main.tf to match current state, then:
terraform plan  # Should show no changes
```

### Import Errors
```bash
# List all resources in state
terraform state list

# Remove resource from state (if needed)
terraform state rm <resource_address>

# Re-import
terraform import <resource_address> <resource_id>
```

### State Conflicts
```bash
# Refresh state from GCP
terraform refresh

# Force unlock (if state is locked)
terraform force-unlock <lock_id>
```

## Next Steps (Phase 3+)

When implementation begins:
1. Uncomment Cloud Run service in `main.tf`
2. Add Secret Manager secrets for OAuth credentials
3. Configure Cloud Run environment variables
4. Set up monitoring and alerting
5. Add VPC connector for private networking (if needed)
