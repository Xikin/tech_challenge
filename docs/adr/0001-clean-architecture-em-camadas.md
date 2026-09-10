# ADR-0001: Arquitetura em camadas (Clean Architecture)

**Status:** Aceita

## Contexto

A Fase 1 entregou a API funcional (clientes, veículos, ordens de serviço, peças), mas com regras de negócio, acesso a dados e HTTP misturados no mesmo arquivo por rota. Isso dificultava testar regras de negócio isoladamente e trocar detalhes de infraestrutura (ORM, framework HTTP) sem tocar em lógica de domínio.

## Decisão

Adotar Clean Architecture com quatro camadas, cada uma só dependendo das camadas mais internas:

```
domain → application → infrastructure → presentation
```

- **`domain`**: entidades, enums, regras invariantes e interfaces de repositório/serviço. Não conhece Prisma, Fastify ou qualquer detalhe externo.
- **`application`**: um caso de uso por ação (`criar-cliente.use-case.ts`, `aprovar-orcamento.use-case.ts`, etc.), orquestrando entidades e repositórios via interface.
- **`infrastructure`**: implementações concretas — repositórios Prisma, serviço de e-mail (Nodemailer), serviço de token (`@fastify/jwt`).
- **`presentation`**: rotas HTTP Fastify, schemas Zod de validação/serialização.

Repositórios são sempre acessados por interface (`domain/repositories/*.interface.ts`), nunca pela implementação concreta diretamente nos casos de uso.

## Consequências

**Positivas:**
- Casos de uso são testáveis unitariamente com repositórios mockados, sem subir banco.
- Trocar um detalhe de infraestrutura (ex.: outro ORM, outro provedor de e-mail) não exige tocar em `domain`/`application`.
- Onboarding mais previsível: toda ação nova segue o mesmo padrão (um use case, uma rota, um schema).

**Negativas:**
- Mais arquivos e indireção para operações simples (CRUD trivial exige interface + implementação + use case + rota).
- Curva de entrada para quem nunca trabalhou com o padrão.

Ver também [docs/arquitetura.md](../arquitetura.md) para o detalhamento de módulos e endpoints.
