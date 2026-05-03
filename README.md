# Oficina Mecânica

Sistema Integrado de Atendimento e Execução de Serviços.

---

## Qualidade e Segurança

| Indicador                   | Resultado                       |
| --------------------------- | ------------------------------- |
| Quality Gate (SonarQube)    | ✅ PASSOU                       |
| Bugs                        | 0                               |
| Vulnerabilidades            | 0                               |
| Security Hotspots           | 0                               |
| Cobertura de testes         | 89,8%                           |
| CORS Misconfiguration (ZAP) | ⚠️ High — corrigível em 1 linha |
| SQL Injection / XSS / RCE   | ✅ Nenhuma encontrada           |

> Relatórios completos em [`reports/`](reports/) e [`docs/qualidade-seguranca.md`](docs/qualidade-seguranca.md)

---

## Stack

| Tecnologia     | Uso                           |
| -------------- | ----------------------------- |
| **Fastify**    | Framework HTTP                |
| **Prisma**     | ORM + migrations              |
| **PostgreSQL** | Banco de dados                |
| **Zod**        | Validação de schemas          |
| **JWT**        | Autenticação stateless        |
| **Vitest**     | Testes unitários e integração |
| **Docker**     | Containerização               |

### Por que PostgreSQL?

O domínio da oficina é intrinsecamente relacional: um cliente possui veículos, cada veículo pode ter múltiplas ordens de serviço, e cada OS agrega itens de serviço e itens de peça com preços congelados no momento da inclusão. Esse modelo de dados se encaixa naturalmente em um banco relacional com chaves estrangeiras e integridade referencial garantida em nível de banco — não apenas em aplicação.

Além da adequação ao modelo, três características do PostgreSQL foram decisivas para este projeto:

**Transações ACID.** Operações críticas como debitar estoque ao adicionar uma peça ou devolver itens ao cancelar uma OS precisam ser atômicas. Uma falha no meio do processo não pode deixar o estoque inconsistente. O Prisma utiliza transações do PostgreSQL para garantir isso.

**Tipo `DECIMAL` para valores monetários.** Preços de peças e serviços são armazenados como `DECIMAL(10,2)`, evitando erros de arredondamento inerentes ao `FLOAT`. Isso é fundamental para que o `valorTotal` de uma OS seja sempre exato.

**Sequências para numeração de OS.** O campo `OrdemServico.numero` usa `@default(autoincrement())`, que no PostgreSQL é implementado como uma sequência atômica — garantindo números únicos e sequenciais mesmo sob concorrência, sem necessidade de lock manual.

---

## Início rápido (Docker)

```bash
# 1. Configure o ambiente
cp .env.example .env

# 2. Suba os containers
docker compose up -d --build

# 3. Rode o seed
docker compose exec api npx prisma db seed

# 4. Acesse a documentação
open http://localhost:3000/docs
```

### Credenciais padrão (após seed)

| Role        | Email                   | Senha     |
| ----------- | ----------------------- | --------- |
| Admin       | admin@oficina.com       | Admin@123 |
| Funcionário | funcionario@oficina.com | Func@123  |

---

## Documentação

| Documento                                            | Descrição                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| [Domínio](docs/dominio.md)                           | Linguagem ubíqua, entidades, regras invariantes e ciclo de vida da OS |
| [Arquitetura](docs/arquitetura.md)                   | Camadas, módulos, endpoints e máquina de estados                      |
| [Desenvolvimento](docs/desenvolvimento.md)           | Execução local, testes, variáveis de ambiente e comandos úteis        |
| [Qualidade e Segurança](docs/qualidade-seguranca.md) | SonarQube e OWASP ZAP                                                 |
