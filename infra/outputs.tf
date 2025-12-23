output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP region"
  value       = var.region
}

output "artifact_registry" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.intentmail.repository_id}"
}

output "deployer_service_account" {
  description = "Deployer service account email"
  value       = google_service_account.deployer.email
}

output "wif_provider" {
  description = "Workload Identity Federation provider resource name"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_secrets" {
  description = "GitHub secrets required for CI/CD"
  value = {
    WIF_PROVIDER       = google_iam_workload_identity_pool_provider.github.name
    DEPLOYER_SA        = google_service_account.deployer.email
    GCP_PROJECT_ID     = var.project_id
    ARTIFACT_REGISTRY  = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.intentmail.repository_id}"
  }
  sensitive = false
}
