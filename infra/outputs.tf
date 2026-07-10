output "cluster_name" {
  description = "Nome do cluster Kind criado"
  value       = kind_cluster.oficina.name
}

output "kubeconfig_path" {
  description = "Caminho para o arquivo kubeconfig do cluster"
  value       = kind_cluster.oficina.kubeconfig_path
}

output "namespace" {
  description = "Namespace Kubernetes da aplicação"
  value       = kubernetes_namespace.oficina.metadata[0].name
}

output "api_url" {
  description = "URL local da API via NodePort"
  value       = "http://localhost:${var.api_node_port}"
}
