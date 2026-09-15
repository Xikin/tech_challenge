# ADR-0012: Limites de tentativa por alvo e login em tempo constante

**Status:** Aceita
**Data:** 2026-09-12
**Relacionado:** [ADR-0009](0009-api-gateway-entrada-unica.md), [ADR-0011](0011-segredos-jwt-por-emissor.md)

## Contexto

A revisão de segurança da Fase 3 encontrou três portas abertas para ataque por
tentativa e erro:

1. **`POST /auth/login` sem limite.** Nada impedia força bruta de senha contra
   uma conta de funcionário ou administrador.
2. **Enumeração de usuários pelo tempo de resposta.** O bcrypt só rodava quando o
   e-mail existia e estava ativo. Uma resposta para e-mail inexistente saía centenas
   de milissegundos mais rápido, e bastava cronometrar o login para saber quem tem
   conta.
3. **`GET /ordens/consulta-publica` sem limite.** A rota não exige autenticação:
   com um número de OS (sequencial, fácil de adivinhar), dava para testar CPFs até
   achar o dono e ler placa, serviços, valores e histórico.

O throttling do API Gateway (50 rps) é **global**, não por cliente, e o NLB público
permite contorná-lo ([ADR-0009](0009-api-gateway-entrada-unica.md)).

## Decisão

### 1. Limite por alvo do ataque, não por IP

| Rota | Chave | Limite |
| --- | --- | --- |
| `POST /auth/login` | e-mail, normalizado (trim + minúsculas) | 5 a cada 15 min |
| `GET /ordens/consulta-publica` | número da OS | 10 a cada 15 min |

A escolha óbvia seria limitar por IP, e ela seria **errada aqui**. Atrás do API
Gateway e do NLB, a API vê como origem o IP do gateway ou do nó, e não o do cliente.
Um limite por IP colocaria todos os clientes da oficina no mesmo balde: o primeiro
atacante bloquearia todo mundo. Confiar no `X-Forwarded-For` também não resolve,
porque o cabeçalho é forjável por quem chama o NLB diretamente.

Limitar pelo **alvo** protege o que interessa independentemente de onde vem o
ataque: uma conta não aguenta mais que 5 senhas por janela, e uma OS não aguenta mais
que 10 CPFs.

Detalhes de implementação:

- `@fastify/rate-limit` 9, a linha compatível com Fastify 4, com `global: false` e
  configuração por rota.
- `hook: 'preHandler'`, porque a chave do login vem do corpo, que só existe depois
  do parse. Consequência boa: um corpo inválido é recusado pela validação (422) antes
  de consumir o contador de um e-mail.
- O plugin lança o objeto do `errorResponseBuilder`. Devolvendo um
  `TooManyRequestsError` (um `AppError`), a resposta sai como 429 no formato padrão da
  API, com `Retry-After` e código `RATE_LIMITED`, e o evento é registrado no log. O
  erro padrão do plugin cairia no ramo de erro interno e responderia 500.
- A tentativa bloqueada **não chega ao banco nem ao bcrypt**, o que também protege
  o banco contra sobrecarga por repetição.

### 2. Login em tempo constante

O bcrypt passa a rodar **sempre**. Quando o e-mail não existe, a comparação usa o
hash de uma senha fictícia com o mesmo custo dos hashes reais. E-mail inexistente,
usuário inativo e senha errada custam o mesmo tempo e devolvem a mesma mensagem.

O hash fictício é gerado na construção do caso de uso. Se fosse gerado na primeira
tentativa com e-mail inexistente, essa tentativa pagaria o custo em dobro e
reintroduziria a diferença.

## Consequências

**Positivas**
- A força bruta contra uma conta cai de ilimitada para 5 tentativas a cada 15 minutos
  (por pod, ver abaixo).
- A enumeração de contas por tempo de resposta deixa de funcionar. Medido com bcrypt
  custo 12, média de 6 tentativas:

  | Caso | Antes | Depois |
  | --- | --- | --- |
  | e-mail inexistente | 0 ms | 336 ms |
  | usuário inativo | 0 ms | 335 ms |
  | senha errada | 326 ms | 330 ms |

  A diferença de 0 para 326 ms entregava quem tem conta; agora os três casos são
  indistinguíveis pelo tempo.
- Validado ponta a ponta no container: cinco logins errados para o mesmo e-mail
  respondem 401 e o sexto responde 429 com `Retry-After`.
- Não depende de IP, então funciona atrás de qualquer proxy.

**Negativas e riscos aceitos**
- **O contador é em memória, por pod.** Com o HPA em N réplicas, o limite efetivo é
  N × 5. Continua sendo ordens de grandeza abaixo do ilimitado, mas não é exato.
- **Bloqueio de conta como negação de serviço.** Quem conhece o e-mail de um
  administrador pode mantê-lo bloqueado errando a senha 5 vezes a cada 15 minutos.
  É o custo inerente de limitar por conta.
- **Não impede password spraying** (a mesma senha testada em muitas contas), que só
  se combate olhando a origem.
- Logins legítimos também contam: um usuário que entrar mais de 5 vezes em 15 minutos
  espera.

## Evolução

1. **AWS WAF no API Gateway** com regra baseada em taxa por IP de cliente real. É o
   lugar certo para limitar por origem, porque o WAF vê o IP antes de qualquer proxy.
   Cobre password spraying e a varredura de muitas OS.
2. **Contador compartilhado** (ElastiCache/Redis) para que o limite valha para o
   cluster, e não por pod. O plugin já aceita `redis` como store.
3. **Desbloqueio por segundo fator** (código por e-mail) em vez de espera, atacando
   o bloqueio de conta como negação de serviço.
