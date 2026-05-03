# Relatório SonarQube — Qualidade de Código

**Projeto:** Oficina Mecânica MVP  
**Data da análise:** 2026-04-29  
**Versão SonarQube:** 10.7.0  
**Quality Gate:** ✅ PASSOU

---

## 1. Resumo Executivo

| Métrica                | Valor     | Classificação |
| ---------------------- | --------- | ------------- |
| Bugs                   | **0**     | A             |
| Vulnerabilidades       | **0**     | A             |
| Security Hotspots      | **0**     | A             |
| Code Smells            | **10**    | A             |
| Cobertura de Testes    | **89,8%** | —             |
| Linhas Duplicadas      | **6,4%**  | —             |
| Linhas de Código       | **2.465** | —             |
| Dívida Técnica (ratio) | **0,1%**  | A             |

**Ratings:**

- Confiabilidade (Reliability): **A (1.0)**
- Segurança (Security): **A (1.0)**
- Manutenibilidade (Maintainability): **A (1.0)**

---

## 2. Problemas Encontrados

### 2.1 Bugs

Nenhum bug identificado.

### 2.2 Vulnerabilidades

Nenhuma vulnerabilidade identificada.

### 2.3 Security Hotspots

Nenhum security hotspot identificado.

### 2.4 Code Smells (10 ocorrências)

#### MAJOR (1)

| Arquivo                                   | Linha | Regra              | Descrição                                                             |
| ----------------------------------------- | ----- | ------------------ | --------------------------------------------------------------------- |
| `src/modules/clientes/clientes.schema.ts` | 8     | `typescript:S3358` | Extraia a operação ternária aninhada para uma instrução independente. |

#### MINOR (9)

| Arquivo                                    | Linha | Regra              | Descrição                                                                |
| ------------------------------------------ | ----- | ------------------ | ------------------------------------------------------------------------ |
| `src/modules/auth/auth.schema.ts`          | 15    | `typescript:S6353` | Use `\d` em vez de `[0-9]` para sintaxe concisa de classe de caracteres. |
| `src/modules/auth/auth.service.ts`         | 16    | `typescript:S6582` | Prefira encadeamento opcional (`?.`) — mais conciso e legível.           |
| `src/modules/clientes/clientes.service.ts` | 39    | `typescript:S6582` | Prefira encadeamento opcional (`?.`) — mais conciso e legível.           |
| `src/modules/ordens/ordens.service.ts`     | 184   | `typescript:S4325` | Asserção desnecessária — não altera o tipo da expressão.                 |
| `src/modules/ordens/ordens.service.ts`     | 186   | `typescript:S4325` | Asserção desnecessária — não altera o tipo da expressão.                 |
| `src/modules/ordens/ordens.service.ts`     | 193   | `typescript:S4325` | Asserção desnecessária — não altera o tipo da expressão.                 |
| `src/shared/utils/validators.ts`           | 31    | `typescript:S6353` | Use `\d` em vez de `[0-9]` (3 ocorrências na mesma linha).               |

---

## 3. Cobertura de Testes

**Cobertura total: 89,8%**

O projeto possui testes unitários e de integração cobrindo os principais módulos. A cobertura está acima do limiar recomendado (80%), com as seguintes áreas de menor cobertura:

- `src/modules/auth/auth.repository.ts` — 42,1%
- `src/modules/pecas/pecas.repository.ts` — 64,8%
- `src/modules/ordens/ordens.repository.ts` — 67,4%
- `src/modules/auth/auth.service.ts` — 76,7%

---

## 4. Duplicação de Código

**6,4% de linhas duplicadas** — dentro do limite aceitável (< 10%).

---

## 5. Conclusão

O projeto apresenta **excelente qualidade de código**. Todos os indicadores críticos (bugs, vulnerabilidades, security hotspots) estão zerados. Os 10 code smells identificados são de baixa severidade e referem-se principalmente a:

1. **Simplificação de expressões TypeScript**: uso de `\d` em vez de `[0-9]`, encadeamento opcional `?.`
2. **Asserções de tipo desnecessárias** em `ordens.service.ts`
3. **Ternário aninhado** em `clientes.schema.ts` (único issue MAJOR)

**Quality Gate: PASSOU** — o projeto atende a todos os critérios de qualidade definidos.

---

_Relatório gerado automaticamente via SonarQube 10.7.0 Community Edition_  
_Dashboard: http://localhost:9000/dashboard?id=oficina-mvp_
