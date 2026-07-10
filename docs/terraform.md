# Terraform

Provisionamento declarativo do cluster Kubernetes local usando **Kind** (Kubernetes in Docker). Os arquivos ficam em `/infra/`.

---

## Visão geral

```
infra/
├── providers.tf           declaração dos providers e versões
├── variables.tf           definição de todas as variáveis
├── main.tf                recursos provisionados
├── outputs.tf             valores exportados após o apply
├── terraform.tfvars       valores reais das variáveis (gitignored)
└── terraform.tfvars.example  template com placeholders
```

O Terraform provisiona **3 recursos** em sequência:

```
kind_cluster.oficina
    └── kubernetes_namespace.oficina
            └── kubernetes_secret.oficina
```

---

## Providers

**Arquivo:** `infra/providers.tf`

| Provider            | Fonte              | Versão    | Função                                      |
|---------------------|--------------------|-----------|---------------------------------------------|
| `tehcyx/kind`       | `tehcyx/kind`      | `~> 0.4.0`| Cria e gerencia clusters Kind via Docker    |
| `hashicorp/kubernetes` | `hashicorp/kubernetes` | `~> 2.32.0` | Aplica recursos K8s no cluster criado |

O provider `kubernetes` usa o kubeconfig gerado pelo Kind:
```hcl
provider "kubernetes" {
  config_path = kind_cluster.oficina.kubeconfig_path
}
```

---

## Variáveis

**Arquivo:** `infra/variables.tf`

| Variável             | Tipo     | Padrão    | Sensível | Descrição                              |
|----------------------|----------|-----------|----------|----------------------------------------|
| `cluster_name`       | `string` | `oficina` | Não      | Nome do cluster Kind                   |
| `namespace`          | `string` | `oficina` | Não      | Namespace Kubernetes da aplicação      |
| `api_node_port`      | `number` | `30000`   | Não      | Porta NodePort da API no host          |
| `postgres_password`  | `string` | —         | **Sim**  | Senha do PostgreSQL                    |
| `jwt_secret`         | `string` | —         | **Sim**  | Chave JWT (mínimo 32 caracteres)       |
| `smtp_host`          | `string` | `""`      | Não      | Host SMTP (opcional)                   |
| `smtp_user`          | `string` | `""`      | **Sim**  | Usuário SMTP (opcional)                |
| `smtp_pass`          | `string` | `""`      | **Sim**  | Senha SMTP (opcional)                  |

Variáveis sensíveis têm `sensitive = true` — o Terraform nunca as exibe no output.

**Configuração local** (`infra/terraform.tfvars`, gitignored):
```hcl
cluster_name  = "oficina"
namespace     = "oficina"
api_node_port = 30000

postgres_password = "sua_senha_segura"
jwt_secret        = "sua_chave_minimo_32_caracteres"

smtp_host = ""
smtp_user = ""
smtp_pass = ""
```

---

## Recursos

**Arquivo:** `infra/main.tf`

### 1. `kind_cluster.oficina`

Cria um cluster Kind com 2 nós (control-plane + worker):

```hcl
resource "kind_cluster" "oficina" {
  name           = var.cluster_name
  wait_for_ready = true
  kind_config {
    node { role = "control-plane"
      extra_port_mappings {
        container_port = var.api_node_port   # 30000
        host_port      = var.api_node_port   # expõe no localhost
      }
    }
    node { role = "worker" }
  }
}
```

O mapeamento `30000 → 30000` faz com que `http://localhost:30000` chegue ao NodePort da API dentro do cluster.

### 2. `kubernetes_namespace.oficina`

Cria o namespace isolando todos os recursos da aplicação. Depende do cluster estar pronto (`depends_on = [kind_cluster.oficina]`).

### 3. `kubernetes_secret.oficina`

Cria o Secret `oficina-secret` com as credenciais sensíveis. Os valores vêm das variáveis do Terraform (nunca hardcoded):

```hcl
data = {
  POSTGRES_PASSWORD = var.postgres_password
  JWT_SECRET        = var.jwt_secret
  SMTP_HOST         = var.smtp_host
  SMTP_USER         = var.smtp_user
  SMTP_PASS         = var.smtp_pass
}
```

---

## Outputs

**Arquivo:** `infra/outputs.tf`

| Output           | Valor                                        | Uso                                      |
|------------------|----------------------------------------------|------------------------------------------|
| `cluster_name`   | Nome do cluster Kind criado                  | Referência para `kind load docker-image` |
| `kubeconfig_path`| Caminho do kubeconfig gerado pelo Kind       | Exportar para `KUBECONFIG`               |
| `namespace`      | Namespace da aplicação                       | Referência nos comandos `kubectl`        |
| `api_url`        | `http://localhost:30000`                     | URL base para testar a API               |

```bash
terraform output api_url
terraform output kubeconfig_path
```

---

## Comandos

### Fluxo completo (primeira vez)

```bash
cd infra

# 1. Copiar e preencher variáveis
cp terraform.tfvars.example terraform.tfvars
# editar terraform.tfvars com suas credenciais

# 2. Inicializar providers
terraform init

# 3. Visualizar o que será criado
terraform plan

# 4. Provisionar cluster + namespace + secret
terraform apply

# 5. Verificar outputs
terraform output
```

### Recriar cluster (após problemas)

Se o cluster foi deletado manualmente e o state ficou desatualizado:

```bash
kind delete cluster --name oficina

terraform state rm kubernetes_secret.oficina
terraform state rm kubernetes_namespace.oficina
terraform state rm kind_cluster.oficina

terraform apply
```

### Destruir tudo

```bash
terraform destroy
# se falhar por cluster inexistente, use o fluxo de "recriar" acima
```

---

## Fluxo de segredos

```
terraform.tfvars (gitignored, local)
        │
        ▼
terraform apply
        │
        ▼
kubernetes_secret "oficina-secret" no cluster K8s
        │
        ▼
api-deployment.yaml lê via secretKeyRef
        │
        ▼
Container recebe as variáveis de ambiente
```

Os valores sensíveis nunca aparecem em logs do Terraform (`sensitive = true`) e nunca são commitados (`.gitignore` inclui `infra/terraform.tfvars`).
