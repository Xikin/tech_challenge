resource "kind_cluster" "oficina" {
  name           = var.cluster_name
  wait_for_ready = true

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    node {
      role = "control-plane"

      extra_port_mappings {
        container_port = var.api_node_port
        host_port      = var.api_node_port
        protocol       = "TCP"
      }
    }

    node {
      role = "worker"
    }
  }
}

resource "kubernetes_namespace" "oficina" {
  depends_on = [kind_cluster.oficina]

  metadata {
    name = var.namespace
    labels = {
      "app.kubernetes.io/part-of" = "oficina"
    }
  }
}

resource "kubernetes_secret" "oficina" {
  depends_on = [kubernetes_namespace.oficina]

  metadata {
    name      = "oficina-secret"
    namespace = var.namespace
  }

  data = {
    POSTGRES_PASSWORD = var.postgres_password
    JWT_SECRET        = var.jwt_secret
    SMTP_HOST         = var.smtp_host
    SMTP_USER         = var.smtp_user
    SMTP_PASS         = var.smtp_pass
  }
}
