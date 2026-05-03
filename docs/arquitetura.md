# Arquitetura

---

## Camadas

```
src/modules/<modulo>/
├── <modulo>.schema.ts      # Validação Zod + tipos
├── <modulo>.repository.ts  # Acesso ao banco (Prisma)
├── <modulo>.service.ts     # Regras de negócio
└── <modulo>.routes.ts      # Handlers HTTP
```

**Fluxo:** `Route → Service → Repository → Prisma`

| Camada         | Responsabilidade                                                                    |
| -------------- | ----------------------------------------------------------------------------------- |
| **Schema**     | Parsing e validação de entrada com Zod                                              |
| **Repository** | Única camada que fala com o Prisma; converte tipos do banco para tipos da aplicação |
| **Service**    | Lógica de negócio e regras invariantes                                              |
| **Route**      | HTTP puro — status codes, serialização e autenticação                               |

---

## Módulos

| Módulo     | Bounded Context                |
| ---------- | ------------------------------ |
| `auth`     | Autenticação e usuários        |
| `clientes` | Gestão de clientes (CPF/CNPJ)  |
| `veiculos` | Gestão de veículos (placa)     |
| `servicos` | Catálogo de serviços           |
| `pecas`    | Peças e insumos (estoque)      |
| `ordens`   | Ordem de Serviço (core domain) |

---

## Endpoints principais

### Autenticação

| Método | Rota             | Auth  |
| ------ | ---------------- | ----- |
| POST   | `/auth/login`    | ❌    |
| GET    | `/auth/me`       | ✅    |
| POST   | `/auth/usuarios` | ADMIN |

### Ordens de Serviço

| Método | Rota                       | Auth |
| ------ | -------------------------- | ---- |
| GET    | `/ordens/consulta-publica` | ❌   |
| POST   | `/ordens`                  | ✅   |
| GET    | `/ordens`                  | ✅   |
| PATCH  | `/ordens/:id/avancar`      | ✅   |
| PATCH  | `/ordens/:id/reprovar`     | ✅   |

> Documentação completa e interativa: **http://localhost:3000/docs**

---

## Máquina de estados da OS

```
RECEBIDA → EM_DIAGNOSTICO → AGUARDANDO_APROVACAO → EM_EXECUCAO → FINALIZADA → ENTREGUE
                                    ↓ (reprovado)
                             EM_DIAGNOSTICO (peças devolvidas ao estoque)
```

Cada transição é registrada em `HistoricoOS` como trilha de auditoria imutável. Veja o significado de cada status em [dominio.md](dominio.md#ciclo-de-vida-da-os).
