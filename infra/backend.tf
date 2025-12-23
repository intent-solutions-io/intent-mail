# Terraform backend configuration for remote state storage
#
# Uncomment and configure when ready to use remote state:
#
# terraform {
#   backend "gcs" {
#     bucket = "mail-with-intent-terraform-state"
#     prefix = "terraform/state"
#   }
# }
#
# To create the state bucket:
# gcloud storage buckets create gs://mail-with-intent-terraform-state \
#   --project=mail-with-intent \
#   --location=us-central1 \
#   --uniform-bucket-level-access
#
# Enable versioning for state history:
# gcloud storage buckets update gs://mail-with-intent-terraform-state --versioning
