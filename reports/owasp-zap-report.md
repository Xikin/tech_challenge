# Relatório OWASP ZAP — Segurança em Execução

**Projeto:** Oficina Mecânica MVP  
**Target:** http://localhost:3000  
**Ferramenta:** OWASP ZAP 2.17.0  
**Tipo de scan:** Full Scan (Spider + Active Scan)  
**Data:** 2026-04-29

---

## 1. Resumo Executivo

| Nível de Risco    | Quantidade                 |
| ----------------- | -------------------------- |
| 🔴 Alto (High)    | **1** alerta, 4 instâncias |
| 🟡 Médio (Medium) | **1** alerta, 1 instância  |
| 🟢 Baixo (Low)    | **0**                      |
| ℹ️ Informacional  | **1** alerta, 4 instâncias |
| **Total**         | **3 tipos de alerta**      |

**Endpoints analisados:** 3  
**Respostas 4xx:** 99% (esperado para API REST protegida por JWT)

---

## 2. Alertas Detalhados

---

### 🔴 [ALTO] CORS Misconfiguration

| Campo                   | Valor                                                           |
| ----------------------- | --------------------------------------------------------------- |
| **Risco**               | Alto                                                            |
| **Confiança**           | Alta (3/3)                                                      |
| **CWE**                 | CWE-942 — Permissive Cross-domain Policy with Untrusted Domains |
| **WASC**                | WASC-14 — Server Misconfiguration                               |
| **Instâncias afetadas** | 4                                                               |

**Descrição:**  
A configuração CORS da API usa `origin: true` (reflete qualquer origem) combinada com `credentials: true`. Isso permite que páginas maliciosas realizem requisições AJAX autenticadas à API em nome da vítima, potencialmente expondo dados sensíveis ou permitindo ações não autorizadas.

**Instâncias observadas:**

```
GET  http://localhost:3000
GET  http://localhost:3000/
GET  http://localhost:3000/robots.txt
GET  http://localhost:3000/health
```

**Evidência técnica:**  
O cabeçalho de resposta `Access-Control-Allow-Origin` reflete a origem da requisição, e `Access-Control-Allow-Credentials: true` está presente simultaneamente.

**Causa no código:**  
`src/app.ts:22` — `await app.register(fastifyCors, { origin: true, credentials: true });`

**Solução recomendada:**  
Substituir `origin: true` por uma lista explícita de origens permitidas:

```typescript
// Antes (inseguro)
await app.register(fastifyCors, { origin: true, credentials: true });

// Depois (seguro)
await app.register(fastifyCors, {
  origin: ["https://app.seudominio.com"],
  credentials: true,
});
```

**Referências:**

- OWASP: [CORS Misconfiguration](https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny)
- RFC 6454 — The Web Origin Concept

---

### 🟡 [MÉDIO] HTTP Only Site

| Campo                   | Valor                                            |
| ----------------------- | ------------------------------------------------ |
| **Risco**               | Médio                                            |
| **Confiança**           | Média (2/3)                                      |
| **CWE**                 | CWE-311 — Missing Encryption of Sensitive Data   |
| **WASC**                | WASC-4 — Insufficient Transport Layer Protection |
| **Instâncias afetadas** | 1                                                |

**Descrição:**  
A API está sendo servida apenas via HTTP (sem HTTPS). Em ambiente de produção, isso expõe tokens JWT, dados de clientes e credenciais a ataques de interceptação (man-in-the-middle).

**Instância observada:**

```
GET  http://localhost:3000/
```

**Nota:**  
Este alerta é esperado em ambiente de **desenvolvimento/teste local**. Em produção, a API deve obrigatoriamente ser servida via HTTPS com certificado válido.

**Solução recomendada:**

- Em produção: configurar HTTPS no reverse proxy (Nginx/Traefik) ou diretamente no Fastify
- Adicionar redirecionamento automático HTTP → HTTPS
- Implementar `Strict-Transport-Security` (HSTS)

```nginx
server {
    listen 80;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ...
}
```

---

### ℹ️ [INFORMACIONAL] Storable and Cacheable Content

| Campo                   | Valor                                                |
| ----------------------- | ---------------------------------------------------- |
| **Risco**               | Informacional                                        |
| **Confiança**           | Média (2/3)                                          |
| **CWE**                 | CWE-524 — Use of Relevant Cached or Non-Current Data |
| **WASC**                | WASC-13 — Information Leakage                        |
| **Instâncias afetadas** | 4                                                    |

**Descrição:**  
Algumas respostas da API não possuem cabeçalhos de controle de cache explícitos (`Cache-Control`, `Pragma`), o que pode permitir que intermediários (proxies, CDNs) armazenem respostas potencialmente sensíveis.

**Instâncias observadas:**

```
GET  http://localhost:3000
GET  http://localhost:3000/
GET  http://localhost:3000/robots.txt
GET  http://localhost:3000/health
```

**Solução recomendada:**  
Para endpoints que retornam dados sensíveis, adicionar cabeçalhos de cache:

```typescript
// Em respostas com dados sensíveis
reply.header("Cache-Control", "no-cache, no-store, must-revalidate, private");
reply.header("Pragma", "no-cache");
reply.header("Expires", "0");
```

---

## 3. Testes que PASSARAM (relevantes)

O OWASP ZAP executou **mais de 100 verificações**. Os seguintes testes críticos **não encontraram problemas**:

| Teste                                 | Resultado |
| ------------------------------------- | --------- |
| SQL Injection                         | ✅ PASS   |
| Cross-Site Scripting (XSS)            | ✅ PASS   |
| Command Injection                     | ✅ PASS   |
| Path Traversal                        | ✅ PASS   |
| Authentication Bypass                 | ✅ PASS   |
| Weak Authentication                   | ✅ PASS   |
| Information Disclosure (debug errors) | ✅ PASS   |
| Server-side Request Forgery (SSRF)    | ✅ PASS   |
| Remote Code Execution - Shell Shock   | ✅ PASS   |
| Heartbleed Vulnerability              | ✅ PASS   |
| Server Headers Information Leak       | ✅ PASS   |
| Dangerous JS Functions                | ✅ PASS   |
| Vulnerable JS Libraries               | ✅ PASS   |
| PII Disclosure                        | ✅ PASS   |
| Backup File Disclosure                | ✅ PASS   |
| Open Redirect                         | ✅ PASS   |

---

## 4. Plano de Remediação

| Prioridade    | Vulnerabilidade        | Esforço                   | Impacto |
| ------------- | ---------------------- | ------------------------- | ------- |
| 🔴 P1 — Alta  | CORS Misconfiguration  | Baixo (1 linha de código) | Alto    |
| 🟡 P2 — Média | HTTP Only Site         | Médio (infra/deploy)      | Alto    |
| ℹ️ P3 — Baixa | Cache Headers ausentes | Baixo                     | Baixo   |

---

## 5. Conclusão

A API apresenta **boa postura de segurança** para uma aplicação REST com autenticação JWT. Os principais problemas identificados são:

1. **CORS muito permissivo** (High): pode ser corrigido em minutos alterando uma linha de configuração
2. **Ausência de HTTPS** (Medium): típico de ambiente local/desenvolvimento — obrigatório corrigir antes de produção

Não foram encontradas vulnerabilidades críticas como injeção SQL, XSS, RCE ou bypass de autenticação, o que indica boas práticas de desenvolvimento seguro.

---

_Relatório gerado automaticamente via OWASP ZAP 2.17.0_  
_Arquivos de evidência: `zap-report.html`, `zap-report.xml`, `zap-report.json`_
