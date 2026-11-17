# ADR-0013: Divisão em três microsserviços com dono único de cada dado

**Status:** Aceita

## Contexto

Na Fase 3 a aplicação era um monólito com um único schema PostgreSQL: clientes, veículos, catálogo de serviços, estoque de peças, ordens de serviço, orçamento e usuários. A Lambda de autenticação por CPF lia a tabela `clientes` direto do mesmo banco.

A Fase 4 exige pelo menos três microsserviços independentes, cada um com repositório, infraestrutura e banco próprios, e proíbe que um serviço acesse o banco de outro.

## Decisão

Três serviços, cortados pelo dono de cada informação e pela etapa do atendimento em que ela muda:

| Serviço | Repositório | É dono de | Banco |
| --- | --- | --- | --- |
| **OS Service** | `oficina-mvp` | usuários internos, clientes, veículos, ordem de serviço e histórico; orquestra a saga; notifica o cliente | PostgreSQL (RDS) + Redis como cache |
| **Execução e Produção** | `oficina-execucao` | catálogo de serviços, estoque de peças, fila de diagnóstico e reparo | PostgreSQL (instância RDS própria) |
| **Orçamento e Pagamento** | `oficina-billing` | orçamentos, aprovação, pagamentos e estornos no Mercado Pago | MongoDB |

Escolhas que não são óbvias:

- **Catálogo e estoque ficam no Execução, não no OS.** Quem consome peça é o mecânico, e a reserva de estoque precisa acontecer na mesma transação que conclui o diagnóstico. Com o estoque em outro serviço, cada diagnóstico viraria uma saga só para reservar peças.
- **A OS guarda uma cópia dos itens orçados** (nome, quantidade, preço do momento) em vez de chave estrangeira para o catálogo. Isso é o que o cliente aprovou; mudar o preço no catálogo depois não pode alterar uma OS antiga.
- **O e-mail ao cliente sai do OS Service**, que é o dono do cadastro do cliente. O Billing recebe só nome e e-mail no comando de orçamento, para preencher o pagador no Mercado Pago.
- **A Lambda deixou de ler o banco.** Ela chama `POST /integracao/clientes/identificar` no OS Service com uma chave de integração (`x-api-key`) e saiu da VPC, porque não precisa mais do RDS.

## Consequências

**Positivas:**
- Cada serviço publica, escala e falha sozinho; o Billing fora do ar não impede abrir OS nem diagnosticar.
- Nenhum serviço tem credencial do banco de outro: as `DATABASE_URL`/`MONGODB_URI` são distribuídas por pipeline, uma por serviço.

**Negativas:**
- Consultas que antes eram um `JOIN` (OS com preço atual do catálogo) passam a depender de cópia de dados ou de chamada entre serviços.
- Os três serviços validam o mesmo JWT interno (HS256), então compartilham o `JWT_SECRET`. Trocar para chaves assimétricas (RS256 com JWKS publicado pelo OS Service) eliminaria esse compartilhamento.
- As duas instâncias RDS aceitam conexão dos nós do EKS pelo mesmo security group; o isolamento entre OS e Execução é por credencial, não por rede.
