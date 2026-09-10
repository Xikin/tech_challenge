# ADR-0009: API Gateway como ponto único de entrada

**Status:** Aceita
**Data:** 2026-09-09

## Contexto

A Fase 3 exige "API Gateway para controle e roteamento" e uma função serverless de
autenticação. São dois componentes que precisam parecer um só endereço para quem
consome a API: o cliente não deveria autenticar num host e consumir a API em outro.

Na Fase 2 a API era exposta por `NodePort` num cluster Kind, alcançável só por
`port-forward` na máquina do desenvolvedor.

## Decisão

**AWS API Gateway HTTP API (v2)** na frente de tudo, com duas rotas:

| Rota | Integração | Autenticação |
| --- | --- | --- |
| `POST /auth/cpf` | `AWS_PROXY` → Lambda `oficina-auth` | pública |
| `ANY /{proxy+}` | `HTTP_PROXY` → NLB do cluster | JWT validado pela própria API |

### HTTP API, não REST API

~70% mais barato, latência menor e CORS nativo. Perdemos request validators, API
keys e integração direta com WAF — nada disso é exigido, e a validação de entrada
já é feita com Zod na aplicação e no handler da Lambda.

### A validação do JWT fica na aplicação, não no gateway

O API Gateway suporta JWT authorizer nativo, mas apenas para emissores OIDC/JWKS. O
token aqui é HS256 com segredo compartilhado, que o authorizer nativo não valida.
As alternativas seriam trocar para RS256 com JWKS público, ou escrever uma Lambda
authorizer — ambas adicionam um componente e uma cobrança por invocação para
duplicar uma checagem que a API já faz corretamente.

Consequência aceita: **o gateway não filtra requisição sem token**; ela chega ao
cluster e recebe 401 lá. O throttling (50 rps, burst 20) é a proteção contra abuso.

### O NLB é público

O ideal seria NLB interno + VPC Link, o que tornaria a API inalcançável fora do
gateway. Não foi feito porque o NLB é criado pelo **Kubernetes** (via
`Service type: LoadBalancer`), enquanto o VPC Link e a integração vivem no
Terraform de outro repositório — a integração privada exige o ARN do listener, que
só existe depois que o Service sobe. Amarrar isso exigiria um `null_resource` com
espera ativa, ou mover o balanceador para o Terraform e perder a integração nativa
do Kubernetes.

Consequência aceita: **o NLB é acessível diretamente, contornando o gateway.** O
que se perde nesse caminho é o throttling e o access log correlacionado — não há
perda de autorização, porque quem valida o token é a aplicação.

### Correlação de requisições

O gateway injeta `x-request-id: $context.requestId` em toda requisição que faz
proxy. A API honra esse header em `genReqId` e o devolve na resposta; a Lambda faz
o mesmo. Uma requisição pode ser seguida do access log do gateway até a linha de
log da aplicação pelo mesmo identificador.

## Consequências

**Positivas**
- Um endereço único para clientes internos e externos.
- Access log JSON estruturado de tudo que entra, com latência de integração.
- Throttling central, que freia força bruta de CPF na rota de autenticação.
- Trocar o backend (outro cluster, outra região) não muda a URL pública.

**Negativas**
- Um salto de rede a mais: gateway → NLB → pod.
- Timeout máximo de 29s no HTTP API. Nenhuma rota atual chega perto, mas relatórios
  futuros precisariam de processamento assíncrono.
- O NLB público é um caminho paralelo, com menos observabilidade.

## Evolução

1. NLB interno + VPC Link, fechando o caminho paralelo.
2. RS256 com JWKS servido pela Lambda, permitindo JWT authorizer nativo e rejeição
   de token inválido na borda.
3. WAF no gateway, com rate limit por IP na rota de autenticação.
