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

Uma oficina mecânica tem dados que se conectam naturalmente: o cliente tem veículos, cada veículo pode ter várias ordens de serviço, e cada OS reúne serviços e peças com os preços registrados no momento em que foram incluídos. Esse tipo de dado pede um banco relacional — e o PostgreSQL é a escolha mais sólida e confiável para isso.

Três pontos foram decisivos na escolha:

**Operações seguras.** Quando uma peça é adicionada numa OS, o estoque precisa ser descontado ao mesmo tempo. Se algo der errado no meio do caminho, o banco desfaz tudo automaticamente — sem deixar o estoque pela metade. O Prisma usa esse recurso do PostgreSQL para garantir que as coisas aconteçam de forma completa ou não aconteçam.

**Valores sem erro de arredondamento.** Preços de peças e serviços são guardados num formato numérico preciso (`DECIMAL`), não em ponto flutuante. Isso evita aqueles centavos a mais ou a menos que surgem quando se usa formatos inadequados para dinheiro.

**Numeração de OS sem duplicata.** Cada ordem de serviço recebe um número único e em ordem. O PostgreSQL garante isso de forma automática, mesmo que várias OSs sejam abertas ao mesmo tempo.

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
