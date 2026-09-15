# Notas de implementação

O código deste repositório não tem comentários. O que não dá para deduzir lendo o código — o porquê de uma
escolha, restrições externas, contratos com os outros repositórios — fica registrado aqui, organizado por
arquivo. Decisões de arquitetura mais amplas estão nos [ADRs](adr/README.md).

---

## Configuração

### `.env.example`

Copie para `.env` para rodar localmente.

| Variável | Observação |
| --- | --- |
| `DATABASE_URL` | Local: o `docker compose` sobe um Postgres. Em produção, a URL vem do SSM (`/oficina/<env>/db/database_url`), escrita pelo Terraform de oficina-infra-db. |
| `JWT_SECRET` | Assina o login interno (ADMIN/FUNCIONARIO) e nunca sai desta API. 32+ caracteres aleatórios. |
| `JWT_CLIENTE_SECRET` | Valida os tokens da Lambda de autenticação por CPF (papel CLIENTE). Precisa ser **idêntico** ao configurado em oficina-auth-lambda e **diferente** do `JWT_SECRET` ([ADR-0011](adr/0011-segredos-jwt-por-emissor.md)): com um segredo único, quem obtivesse o da Lambda forjaria tokens de ADMIN. `src/config/env.ts` recusa os dois iguais. |
| `SMTP_*` | Opcional. Deixe `SMTP_HOST` em branco para desabilitar e-mails. |
| `ALLOWED_ORIGINS` | Origens de CORS separadas por vírgula. Vazio libera qualquer origem fora de produção; em produção, uma lista vazia bloqueia tudo — preencha com o domínio do front. |
| `NEW_RELIC_LICENSE_KEY` | Sem a licença, o agente New Relic fica desligado e nada é enviado (desenvolvimento e testes). |
| `SWAGGER_ENABLED` | Ligado por padrão inclusive em produção, para que o link do Swagger funcione. Desligue com `false` se a API for exposta a um público não confiável. |
| `SEED_ADMIN_PASSWORD`, `SEED_FUNCIONARIO_PASSWORD` | Senhas dos usuários internos criados pelo seed. Sem elas, o seed gera senhas aleatórias e as exibe uma vez. |
| `SEED_PERMITIR_SENHA_PADRAO` | `true` usa `Admin@123` / `Func@123` — apenas para o ambiente local e a collection Postman. **Nunca** ligue em ambiente publicado. No `docker-compose.yml` o padrão é `false`. |
| `SONAR_TOKEN` | Opcional; token do SonarQube local, usado por `npm run sonar` (fora do pipeline). |

### `.gitignore` e `.dockerignore`

- `.gitignore` ignora, além do usual, o kubeconfig gerado pelo provider kind (contém client cert/key do cluster
  local), secrets do Kubernetes gerados localmente, os arquivos do `act` (GitHub Actions local) e o diretório do
  runner self-hosted, que contém `.credentials`, `.credentials_rsaparams`, um `.env` com `KUBECONFIG` e o
  binário do runner.
- `.dockerignore` mantém o contexto de build enxuto e sem segredos: `.env`, state e tfvars do Terraform,
  `k8s/secret.yaml`, o runner self-hosted e a documentação ficam fora da imagem.

### `.github/dependabot.yml`

As actions são fixadas por SHA de commit (supply chain: uma tag como `@v4` pode ser movida para código
malicioso), com a versão legível no comentário `# vX.Y.Z` ao lado de cada `uses:`. O Dependabot mantém esses SHAs
atualizados abrindo PRs; sem ele, o pin congelaria as actions para sempre. Nas dependências npm, patches e minors
vêm agrupados; majors (fastify 5, nodemailer 10…) chegam em PRs separados, porque exigem migração de código.

---

## Aplicação

### `src/app.ts`

- **Logger.** `base` fixa `service`, `env` e `version` em toda linha, para filtrar por serviço e ambiente no New
  Relic sem depender do nome do pod. O serializer `req` substitui o padrão do Fastify, que grava a URL crua — e
  com ela o CPF/CNPJ de `/clientes/cpf-cnpj/:documento` e da querystring da consulta pública. Os demais campos
  replicam o serializer padrão.
- **`genReqId`.** Honra o `x-request-id` propagado pelo API Gateway e pela Lambda; na ausência dele, gera um
  UUID. O padrão do Fastify é um contador por processo, que colide entre pods. O hook `onSend` devolve o id ao
  chamador.
- **CORS.** Lista vazia significa "sem restrição" fora de produção. Em produção, uma lista vazia bloquearia tudo —
  um erro de configuração silencioso e difícil de diagnosticar.
- **JWT.** Dois registros do `@fastify/jwt`, cada um com o seu segredo
  ([ADR-0011](adr/0011-segredos-jwt-por-emissor.md)). O registro padrão assina e valida o login interno; o
  namespace `cliente` apenas valida os tokens da Lambda. A amarração entre emissor (`iss`) e papel é conferida no
  middleware `autenticar`.
- **Rate limit.** Por rota, e não global ([ADR-0012](adr/0012-limites-de-tentativa.md)). A chave de cada limite é
  o alvo do ataque — o e-mail no login, o número da OS na consulta pública — e não o IP: atrás do API Gateway e do
  NLB as requisições chegam com o IP do gateway ou do nó, e limitar por ele travaria todos os clientes juntos. A
  mensagem do 429 é montada a partir de `contexto.ttl`, porque `contexto.after` vem em inglês ("15 minutes").
- **Error handler.** Todo erro tratado emite uma linha de log correlacionada. Erros de negócio (4xx) saem como
  `warn` — comportamento esperado —, e não como `error`.
- **Healthchecks.** `/health` (liveness) é deliberadamente raso: se tocasse o banco, uma indisponibilidade do RDS
  reiniciaria todos os pods em cascata. `/health/ready` (readiness) consulta o banco de fato, para que o
  Kubernetes tire o pod do balanceamento quando o RDS estiver inacessível.

### `src/server.ts`

O Kubernetes manda SIGTERM e só depois de `terminationGracePeriodSeconds` manda SIGKILL. O handler de sinal fecha
o servidor (para de aceitar conexões e aguarda as que estão em andamento) e o Prisma antes de sair, para não
cortar requisições em voo. Numa falha de inicialização ainda não existe logger do Fastify, então a linha é emitida
em JSON à mão para manter o formato de log.

### `src/config/env.ts`

`JWT_SECRET` e `JWT_CLIENTE_SECRET` exigem 32+ caracteres, e o `refine` recusa os dois iguais — ver
`JWT_CLIENTE_SECRET` em `.env.example`, acima.

---

## Autenticação e autorização

### `src/domain/auth/emissores.ts`

Emissores reconhecidos no claim `iss`. Cada um tem segredo próprio e só pode emitir um conjunto fechado de papéis:

| Emissor | Segredo | Papéis |
| --- | --- | --- |
| `EMISSOR_INTERNO` (`oficina-api`) | `JWT_SECRET` | ADMIN, FUNCIONARIO |
| `EMISSOR_CLIENTE` (`oficina-auth-lambda`) | `JWT_CLIENTE_SECRET` | CLIENTE |

O valor de `EMISSOR_CLIENTE` precisa ser idêntico ao `issuer` usado em `oficina-auth-lambda/src/token.ts`.

### `src/domain/enums/role.enum.ts`

- `Role` são os papéis **persistidos** em `usuarios`: o pessoal interno da oficina, autenticado por e-mail e senha
  na própria API ([ADR-0004](adr/0004-autenticacao-stateless-jwt.md)).
- `RoleToken` são os papéis que podem aparecer no claim `role`. `CLIENTE` é o cliente final autenticado por CPF na
  Lambda e **não** é um `Role`: não existe linha em `usuarios` para ele, e o enum `Role` do banco continua com dois
  valores. O papel só existe dentro do token. Esta API nunca emite token de CLIENTE — apenas o valida e restringe
  o acesso aos recursos do próprio cliente ([ADR-0008](adr/0008-autorizacao-do-papel-cliente.md)).

### `src/presentation/http/middlewares/auth.middleware.ts`

- `UsuarioAutenticado`: `cpf` e `nome` só existem em tokens emitidos pela Lambda.
- `verificarComo` valida o token contra o segredo de um emissor e confere se `iss` e `role` são compatíveis com
  ele. Devolve `false` quando a assinatura não é desse emissor (ou o token expirou, ou está malformado), e o
  chamador tenta o outro emissor. **Lança** quando a assinatura é válida mas os claims não batem: isso não é token
  vencido nem lixo, é tentativa de forjar papel com um segredo obtido indevidamente (evento
  `token_emissor_invalido`, que alimenta um alerta).
- `autenticar` amarra emissor e papel: vazar o segredo da Lambda permite no máximo forjar um CLIENTE, nunca um
  ADMIN. O `iss` é conferido em código, e não com `allowedIss` do fast-jwt, porque a versão em uso tem uma CVE
  justamente na validação desse claim.
- `exigirInterno`: sem este guard, um JWT de CLIENTE emitido legitimamente pela Lambda daria acesso a todas as
  rotas autenticadas — listar todos os clientes e ordens, alterar OS de terceiros
  ([ADR-0008](adr/0008-autorizacao-do-papel-cliente.md)).
- `exigirDonoDoRecurso` libera o pessoal interno ou o próprio cliente dono do recurso. `extrairDonoId` recebe a
  requisição autenticada e devolve o id do cliente dono, normalmente consultando o repositório. Devolver `null`
  significa "recurso não encontrado": o guard deixa a rota responder 404 no fluxo normal, em vez de vazar a
  existência do recurso com um 403.

### `src/types/fastify-jwt.d.ts`

O segundo registro do `@fastify/jwt` (namespace `cliente`, ver `src/app.ts`) cria os decorators em runtime; o
arquivo apenas os declara para o TypeScript.

### `src/infrastructure/services/fastify-token.service.ts`

O `iss` é passado explicitamente no `sign`: o `@fastify/jwt` só aplica as opções padrão do plugin quando nenhuma
opção é passada. Com `{ expiresIn }` elas seriam descartadas, e o token sairia sem emissor e seria recusado na
verificação.

### `src/application/use-cases/auth/login.use-case.ts`

O bcrypt roda **sempre** — e-mail inexistente, usuário inativo ou senha errada —, e as três falhas devolvem a
mesma mensagem. Quando o e-mail não existe, a comparação é feita contra o hash de uma senha que não pertence a
ninguém, com o mesmo custo dos hashes reais: a resposta leva o mesmo tempo nos dois casos, e cronometrar o login
deixa de revelar quem tem conta. Esse hash fictício é gerado já no construtor; se ficasse para a primeira tentativa
com e-mail inexistente, essa tentativa pagaria o custo em dobro e reintroduziria a diferença de tempo.

### Rotas e schemas

- `routes/auth.routes.ts` — `POST /auth/login` aceita 5 tentativas a cada 15 minutos por e-mail,
  independentemente do IP de origem ([ADR-0012](adr/0012-limites-de-tentativa.md)). Roda em `preHandler` porque a
  chave vem do corpo, disponível só depois do parse e da validação.
- `routes/ordens.routes.ts` — `/consulta-publica` não tem autenticação, então limita as tentativas por número de
  OS, para que não se descubra por tentativa e erro o CPF dono de uma ordem. `AvancarStatusUseCase` e
  `AprovarOrcamentoUseCase` disparam e-mail e registram falhas de integração; por isso são construídos por
  requisição, recebendo o `req.log` — o child logger do Fastify que já carrega o `reqId`.
- `routes/clientes.routes.ts` — o próprio cliente pode consultar o seu cadastro: o `sub` do token emitido pela
  Lambda é o id do cliente.
- `schemas/auth.schema.ts` — em `/auth/me`, `email` e `nome` são opcionais porque tokens de CLIENTE podem não ter
  e-mail (`Cliente.email` é nullable e a Lambda omite o claim). O CPF não é devolvido de propósito.

### `src/shared/errors/index.ts`

`TooManyRequestsError` é o objeto construído pelo `errorResponseBuilder` do `@fastify/rate-limit`, que o lança.
Por ser um `AppError`, o error handler responde 429 no mesmo formato das demais falhas, em vez de tratá-lo como
erro interno.

---

## Ordens de serviço

### `src/application/use-cases/ordens/ordens.constants.ts`

`timestampsParaStatus` precisa ser função, não constante: num objeto de módulo, os `new Date()` seriam avaliados
uma única vez, no carregamento, e toda ordem receberia o horário de boot do processo em vez do horário da
transição.

### `src/application/use-cases/ordens/criar-ordem.use-case.ts`

Emite o evento `os_criada`, que alimenta o painel de volume diário de OS. Um evento explícito é mais confiável do
que contar transações HTTP 201 no APM: sobrevive a mudanças de rota e de status code.

### `src/application/use-cases/ordens/avancar-status.use-case.ts`

- A duração no status anterior é calculada a partir de `historico_os`, e **não** das colunas
  `aprovadoEm`/`iniciadoEm`/`finalizadoEm` da OS: aquelas são um cache mantido pela aplicação e podem divergir,
  enquanto `historico_os.criado_em` é `DEFAULT now()` gerado pelo banco ([modelo-de-dados.md](modelo-de-dados.md),
  seção 6). O histórico vem ordenado por `criadoEm` ascendente, então o último item é a transição mais recente — o
  momento em que a OS entrou no status atual.
- O e-mail é disparado sem `await` de propósito: a transição de status não deve falhar porque o SMTP está fora do
  ar ([ADR-0002](adr/0002-comunicacao-sincrona-rest.md)). A falha é registrada como `falha_integracao`, que é o
  sinal do alerta de falha de integração. `aprovar-orcamento.use-case.ts` segue o mesmo padrão.

### `src/domain/services/logger.service.interface.ts`

`ILogger` permite que casos de uso registrem eventos sem importar Fastify ou pino — mesma razão de
`IEmailService` e `ITokenService`. A implementação injetada nas rotas é o `req.log` do Fastify, um child logger
com o `reqId` da requisição, então a linha emitida no caso de uso correlaciona automaticamente com as linhas de
entrada e saída da mesma requisição. A assinatura (objeto primeiro, mensagem depois) é a do pino de propósito: o
`req.log` satisfaz a interface sem adaptador. `loggerSilencioso` é usado em testes e onde não há requisição
associada.

### `src/shared/utils/mascarar-documentos.ts`

Usado no serializer de requisição do logger: sem ele, o Fastify grava a URL crua com o documento de
`/clientes/cpf-cnpj/:documento` ou de `/ordens/consulta-publica?cpfCnpj=`. CPF é dado pessoal (LGPD) e não pode
ir para log nem para o New Relic.

Aceita documentos com ou sem pontuação e a barra do CNPJ codificada na URL (`%2F`). O CNPJ é tratado primeiro
porque contém uma sequência de 11 dígitos. Números de OS, placas e UUIDs não são afetados: a exigência de fronteira
de palavra impede casar trechos de sequências maiores.

---

## Banco de dados

### `prisma/schema.prisma` — índices

| Tabela | Índice | Motivo |
| --- | --- | --- |
| `clientes` | `nome`, `ativo` | Busca por nome na tela de atendimento; `ativo` filtra a listagem padrão. |
| `veiculos` | `clienteId` | FK sem índice: "veículos do cliente X" fazia seq scan. |
| `ordens_servico` | `status` | Coluna dos painéis (volume diário, tempo médio por status) e filtro mais usado na listagem. |
| `ordens_servico` | `status, criadoEm` | "OS abertas, mais recentes primeiro": consulta da tela inicial e do painel de volume diário. |
| `historico_os` | `ordemId, criadoEm` | Fonte de verdade do tempo médio por status: a consulta é sempre por ordem, em ordem cronológica. |

As migrations em `prisma/migrations/` mantêm os comentários que o Prisma gera: migration já aplicada não deve ser
editada.

### `prisma/seed.ts`

- `POLITICA_SENHA` replica a política de `criarUsuarioSchema` (`src/presentation/http/schemas/auth.schema.ts`);
  as duas precisam andar juntas.
- A senha dos usuários internos segue esta precedência:
  1. variável de ambiente (`SEED_ADMIN_PASSWORD` / `SEED_FUNCIONARIO_PASSWORD`), validada contra a política;
  2. a senha de desenvolvimento, **somente** com `SEED_PERMITIR_SENHA_PADRAO=true`;
  3. senha aleatória forte, exibida uma única vez no terminal. O prefixo `Aa1@` garante a política; o restante são
     144 bits aleatórios.
- Usuário que já existe não tem a senha alterada: exibir uma senha "gerada" que não foi aplicada seria pior do que
  não exibir nada.
- Clientes de demonstração da autenticação por CPF. Os CPFs são sintéticos, mas com dígito verificador válido —
  senão a Lambda os rejeitaria com 422 antes de consultar o banco. Cada um cobre um caminho do fluxo:

  | CPF | Cliente | Situação | Resposta da Lambda |
  | --- | --- | --- | --- |
  | 529.982.247-25 | Ana | ativa, com e-mail | 200, token com claim `email` |
  | 111.444.777-35 | Bruno | ativo, sem e-mail | 200, token sem claim `email` |
  | 123.456.789-09 | Carla | inativa | 403 `CLIENT_INACTIVE` |

  Ana e Bruno ganham uma OS cada, para demonstrar a autorização por dono: com o token da Ana, a OS da Ana responde
  200 e a do Bruno responde 403.

---

## Container e Kubernetes

### `Dockerfile`

- Os arquivos da aplicação ficam com dono root e sem permissão de escrita para o usuário que roda o processo. Com
  isso e com `readOnlyRootFilesystem` no Kubernetes, uma execução remota de código não consegue se tornar
  persistente.
- `/tmp` é a única área gravável (tmpfs/emptyDir). `HOME` e o cache do npm apontam para lá para que
  `npx prisma db seed` funcione com o filesystem só-leitura.
- `NODE_OPTIONS="-r newrelic"` carrega o agente **antes** de qualquer módulo da aplicação, o que permite
  instrumentar Fastify, Prisma e o driver do Postgres.
- O `CMD` usa `exec` no lugar do shell: sem ele, o `sh` fica como PID 1 e o SIGTERM do Kubernetes nunca chega ao
  Node, quebrando o encerramento gracioso. Usa o binário local do Prisma em vez de `npx`, sem resolução de pacote
  nem escrita de cache no start.

### `docker-compose.yml`

O serviço `api` segue a mesma postura do Kubernetes: filesystem só-leitura, escrita apenas em `/tmp`. Sem opt-in
explícito (`SEED_PERMITIR_SENHA_PADRAO`), o seed gera senhas aleatórias para os usuários.

### `k8s/api-deployment.yaml`

- **Sem `replicas`**, de propósito: quem é dono da escala é o HPA (`k8s/hpa.yaml`). Se o campo existisse, todo
  `kubectl apply` devolveria a contagem para o valor do manifesto, desfazendo o autoscaling.
- `maxUnavailable: 0`: nenhuma janela sem capacidade durante o deploy.
- `terminationGracePeriodSeconds: 45` dá tempo ao encerramento gracioso do Node (`src/server.ts`) para drenar as
  requisições em voo antes do SIGKILL.
- `topologySpreadConstraints` espalha as réplicas entre nós: duas réplicas no mesmo nó não sobrevivem à perda dele.
- O volume `tmp` é a única área gravável do pod, limitado a 64Mi para que um processo comprometido não consiga
  encher o disco do nó.
- Não há `imagePullSecrets`: a imagem vem do ECR da própria conta, e os nós a puxam com a role deles.
- `JWT_CLIENTE_SECRET` é diferente do `JWT_SECRET` de propósito ([ADR-0011](adr/0011-segredos-jwt-por-emissor.md)).
- `APP_VERSION` é substituído pelo pipeline pelo SHA do commit.
- `resources.requests` não é opcional: o HPA calcula utilização como uso/request, e sem request o HPA de CPU não
  funciona. Os 256Mi de memória consideram os ~30MB que o agente New Relic ocupa sozinho.
- `runAsUser: 100` e `runAsGroup: 101` são obrigatórios junto com `runAsNonRoot`: a imagem declara
  `USER appuser` por nome e, sem o número, o kubelet não consegue provar que não é root e recusa o container com
  `CreateContainerConfigError`. 100/101 são os ids que `adduser -S`/`addgroup -S` atribuem no Dockerfile.
- Probes:
  - a `startupProbe` cobre a janela do `prisma migrate deploy` no start;
  - a `readinessProbe` usa o healthcheck **profundo** (`/health/ready`): se o RDS ficar inacessível, o pod sai do
    balanceamento em vez de responder 500 ao usuário;
  - a `livenessProbe` usa o healthcheck **raso** (`/health`), de propósito: apontando para `/health/ready`, uma
    indisponibilidade do banco reiniciaria todos os pods em cascata sem resolver nada.

### `k8s/api-service.yaml`

- NLB em vez do Classic Load Balancer legado: mais barato, mais rápido e preserva o IP de origem.
- O health check do balanceador usa o endpoint profundo (`/health/ready`), para tirar de rotação um pod cujo banco
  esteja inacessível.
- O DNS que a AWS atribui ao Service é publicado no SSM pelo pipeline e vira o backend do API Gateway.

### `k8s/hpa.yaml`

- `maxReplicas: 10` só é alcançável porque o node group do EKS escala até 4 nós (oficina-infra-k8s): o HPA cria
  pods; o autoscaling do node group cria a capacidade que os hospeda.
- Sobe rápido (janela de 30s) e desce devagar (300s), para não oscilar (flapping) quando o tráfego é irregular.

### `k8s/configmap.yaml`

`ALLOWED_ORIGINS` vazio significa sem restrição em desenvolvimento; em produção, preencha com o domínio do cliente.

### `k8s/secret.example.yaml`

Exemplo da estrutura do Secret — **não** coloque valores reais no arquivo. Em produção, o Secret é criado pelo
pipeline de deploy (`.github/workflows/ci-cd.yml`), que lê a `DATABASE_URL` do SSM Parameter Store (escrita pelo
Terraform de oficina-infra-db) e os demais valores dos GitHub Secrets. A senha do banco nunca é digitada nem
versionada.

- `JWT_SECRET` assina o login interno (ADMIN/FUNCIONARIO) e nunca é compartilhado com a Lambda.
- `JWT_CLIENTE_SECRET` valida os tokens de CLIENTE emitidos pela Lambda: idêntico ao da Lambda e diferente do
  `JWT_SECRET`.

Para criar o Secret manualmente durante um diagnóstico:

```bash
DATABASE_URL=$(aws ssm get-parameter \
  --name /oficina/prod/db/database_url \
  --with-decryption --query Parameter.Value --output text)

kubectl create secret generic oficina-secret --namespace=oficina \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=JWT_SECRET="<segredo do login interno>" \
  --from-literal=JWT_CLIENTE_SECRET="<o MESMO segredo configurado na Lambda>" \
  --from-literal=NEW_RELIC_LICENSE_KEY="<chave de ingestão>" \
  --from-literal=SMTP_HOST="" \
  --from-literal=SMTP_USER="" \
  --from-literal=SMTP_PASS="" \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## CI/CD — `.github/workflows/ci-cd.yml`

- "Publicar endereço da API no SSM" fecha o contrato com oficina-auth-lambda: é esse valor que a rota
  `ANY /{proxy+}` do API Gateway usa como backend.
- O smoke test confere `/health/ready` e, em seguida, que `/clientes` sem token responde 401 — prova de que a
  autorização está ativa.
- "Registrar deploy no New Relic" (change tracking) põe a versão como marcador nos gráficos, ligando uma mudança
  de comportamento ao commit que a causou. Não bloqueia o deploy: é ignorado se os secrets não existirem ou se a
  aplicação ainda não tiver reportado dados (a entidade só existe depois).

---

## Observabilidade

### `newrelic.cjs`

- `distributed_tracing` liga o trace da requisição no API Gateway/Lambda ao trace da API, via cabeçalho
  `traceparent` (W3C).
- `application_logging.forwarding` encaminha as linhas do pino já decoradas com `trace.id` e `span.id` — é o que dá
  "logs em contexto": abrir um trace lento e ver as linhas de log daquela requisição. `local_decorating` fica
  desligado porque o forwarding já cobre o caso; ligar os dois duplicaria os campos de correlação em cada linha.
- `transaction_threshold: 0.5` marca como lenta qualquer transação acima de 500ms. `record_sql: 'obfuscated'`
  registra a query, nunca os valores.
- `error_collector.ignore_status_codes`: 4xx de negócio são respostas esperadas; contá-las como erro poluiria a taxa
  de erro e dispararia alerta falso.
- `attributes.exclude` impede que credenciais e CPF cheguem ao provedor de observabilidade. `request.uri` é
  excluído porque a URI crua carrega o documento em `/clientes/cpf-cnpj/:documento`; o nome da transação continua
  com o padrão da rota, que é o que importa nos painéis de latência.

### `observabilidade/provisionar-newrelic.mjs`

Provisiona no New Relic o dashboard e as condições de alerta da oficina. É idempotente: rodar de novo atualiza o
dashboard e as condições existentes em vez de duplicá-los.

```bash
NEW_RELIC_API_KEY=NRAK-... NEW_RELIC_ACCOUNT_ID=1234567 \
  node observabilidade/provisionar-newrelic.mjs
```

| Variável | Valor |
| --- | --- |
| `NEW_RELIC_API_KEY` | User key (`NRAK-...`), não a license key de ingestão |
| `NEW_RELIC_ACCOUNT_ID` | Account ID numérico |
| `NEW_RELIC_REGION` | `US` (padrão) ou `EU` |

- As condições espelham [alertas.md](../observabilidade/alertas.md). O New Relic exige um termo CRITICAL em toda
  condição, então as de nível "Warning" em alertas.md ganham um CRITICAL num patamar mais severo.
- Sinais de log usam `EVENT_TIMER`: eventos de log chegam esparsos, e o timer fecha a janela depois de 60s sem
  dados, em vez de esperar o próximo evento (`EVENT_FLOW`), que pode demorar horas.
- O monitor sintético de uptime (alertas.md, seção 9) não é criado pelo script: ele precisa da URL pública do API
  Gateway, que muda a cada recriação do ambiente.

---

## Scripts e testes

- `scripts/export-openapi.ts` exporta a especificação OpenAPI para `docs/openapi.json`, para que ela continue
  disponível sem ambiente no ar; roda no CI a cada push. A validação de env exige `DATABASE_URL` e os dois segredos
  JWT distintos, mas nada ali toca o banco, então valores sintéticos bastam para instanciar o app e ler o schema.
- `scripts/sonar-scan.sh` repassa o `SONAR_TOKEN` explicitamente quando ele vem por argumento ou variável de
  ambiente; caso contrário, deixa o docker compose ler o token direto do `.env`.
- `tests/integration/autorizacao.routes.test.ts` garante que um token de CLIENTE legítimo não abre as rotas
  internas nem os recursos de outro cliente. O token de teste tem o mesmo formato emitido pela Lambda (segredo do
  emissor de clientes e `iss` `oficina-auth-lambda`), e um dos cenários é o de quem obtém o segredo da Lambda e
  tenta se passar por administrador.
- `tests/integration/rate-limit.routes.test.ts` ([ADR-0012](adr/0012-limites-de-tentativa.md)): os testes
  compartilham a mesma instância da app — e portanto o mesmo contador em memória —, então a ordem importa.
- `tests/setup.ts` mocka `$queryRaw`, usado pela readiness (`/health/ready`) para provar que o banco responde.
