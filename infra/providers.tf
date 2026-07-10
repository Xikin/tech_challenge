terraform {
  required_version = ">= 1.5.0"

  required_providers {
    kind = {
      source  = "tehcyx/kind"
      version = "~> 0.4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.32.0"
    }
  }
}

provider "kind" {}

provider "kubernetes" {
  config_path = kind_cluster.oficina.kubeconfig_path
}
