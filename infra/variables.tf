variable "api_node_port" {
  description = "NodePort exposto pelo serviço da API no cluster Kind"
  type        = number
  default     = 30000
}

variable "cluster_name" {
  description = "Nome do cluster Kind local"
  type        = string
  default     = "oficina"
}

variable "namespace" {
  description = "Namespace Kubernetes para a aplicação"
  type        = string
  default     = "oficina"
}

variable "postgres_password" {
  description = "Senha do PostgreSQL"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Segredo JWT (mínimo 32 caracteres)"
  type        = string
  sensitive   = true
}

variable "smtp_host" {
  description = "Host SMTP para envio de e-mails (opcional)"
  type        = string
  default     = ""
}

variable "smtp_user" {
  description = "Usuário SMTP (opcional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_pass" {
  description = "Senha SMTP (opcional)"
  type        = string
  default     = ""
  sensitive   = true
}
