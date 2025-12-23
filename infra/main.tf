terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "secretmanager.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "gmail.googleapis.com",
  ])

  service            = each.key
  disable_on_destroy = false
}

# Artifact Registry repository for Docker images
resource "google_artifact_registry_repository" "intentmail" {
  location      = var.region
  repository_id = "intentmail"
  description   = "IntentMail MCP Server container images"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# Service account for Cloud Run deployments
resource "google_service_account" "deployer" {
  account_id   = "intentmail-deployer"
  display_name = "IntentMail Deployer Service Account"
  description  = "Service account for deploying IntentMail to Cloud Run via GitHub Actions"

  depends_on = [google_project_service.apis]
}

# IAM roles for deployer service account
resource "google_project_iam_member" "deployer_roles" {
  for_each = toset([
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/iam.serviceAccountUser",
    "roles/secretmanager.secretAccessor",
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Workload Identity Pool for GitHub Actions
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Workload Identity Pool for GitHub Actions CI/CD"

  depends_on = [google_project_service.apis]
}

# OIDC provider for GitHub
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC Provider"
  description                        = "OIDC provider for GitHub Actions authentication"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository_owner=='intent-solutions-io'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Bind GitHub repository to deployer service account
resource "google_service_account_iam_member" "github_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Cloud Run service (placeholder - will be created by deploy workflow)
# Uncomment and customize when ready to deploy
# resource "google_cloud_run_service" "intentmail" {
#   name     = "intentmail-mcp-server"
#   location = var.region
#
#   template {
#     spec {
#       containers {
#         image = "${var.region}-docker.pkg.dev/${var.project_id}/intentmail/intentmail-mcp-server:latest"
#
#         resources {
#           limits = {
#             memory = "2Gi"
#             cpu    = "2"
#           }
#         }
#       }
#     }
#   }
#
#   traffic {
#     percent         = 100
#     latest_revision = true
#   }
#
#   depends_on = [
#     google_project_service.apis,
#     google_artifact_registry_repository.intentmail
#   ]
# }
