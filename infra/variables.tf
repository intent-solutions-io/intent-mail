variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "mail-with-intent"
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "github_repository" {
  description = "GitHub repository in format 'org/repo'"
  type        = string
  default     = "intent-solutions-io/intent-mail"
}
