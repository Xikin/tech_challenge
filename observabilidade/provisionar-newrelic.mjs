#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Provisiona no New Relic o dashboard e as condições de alerta da oficina.
//
// Observabilidade como código: o que está em observabilidade/ é a fonte da
// verdade, e este script aplica isso na conta. Idempotente — rodar de novo
// atualiza o dashboard e as condições existentes em vez de duplicá-los.
//
//   NEW_RELIC_API_KEY=NRAK-... NEW_RELIC_ACCOUNT_ID=1234567 \
//     node observabilidade/provisionar-newrelic.mjs
//
// Variáveis:
//   NEW_RELIC_API_KEY     User key (NRAK-...), não a license key de ingestão
//   NEW_RELIC_ACCOUNT_ID  Account ID numérico
//   NEW_RELIC_REGION      US (padrão) ou EU
//
// O monitor sintético de uptime (alertas.md, seção 9) não é criado aqui: ele
// precisa da URL pública do API Gateway, que muda a cada recriação do ambiente.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.NEW_RELIC_API_KEY;
const ACCOUNT_ID = Number(process.env.NEW_RELIC_ACCOUNT_ID);
const REGIAO = (process.env.NEW_RELIC_REGION ?? 'US').toUpperCase();

if (!API_KEY || !Number.isInteger(ACCOUNT_ID)) {
  console.error('Defina NEW_RELIC_API_KEY (User key NRAK-...) e NEW_RELIC_ACCOUNT_ID.');
  process.exit(1);
}

const ENDPOINT = REGIAO === 'EU' ? 'https://api.eu.newrelic.com/graphql' : 'https://api.newrelic.com/graphql';
const AQUI = dirname(fileURLToPath(import.meta.url));
const NOME_POLICY = 'oficina-producao';

async function nerdgraph(query, variables = {}) {
  const resposta = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'API-Key': API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const corpo = await resposta.json();
  if (!resposta.ok || corpo.errors?.length) {
    throw new Error(`NerdGraph: ${JSON.stringify(corpo.errors ?? corpo)}`);
  }
  return corpo.data;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function provisionarDashboard() {
  const bruto = readFileSync(join(AQUI, 'dashboard.json'), 'utf8');
  const dashboard = JSON.parse(bruto.replaceAll('ACCOUNT_ID_AQUI', String(ACCOUNT_ID)));

  const busca = await nerdgraph(
    `query($q: String!) { actor { entitySearch(query: $q) { results { entities { guid name } } } } }`,
    { q: `accountId = ${ACCOUNT_ID} AND type = 'DASHBOARD' AND name = '${dashboard.name.replaceAll("'", "\\'")}'` },
  );
  const existente = busca.actor.entitySearch.results.entities[0];

  if (existente) {
    const r = await nerdgraph(
      `mutation($guid: EntityGuid!, $d: DashboardInput!) {
         dashboardUpdate(guid: $guid, dashboard: $d) { entityResult { guid } errors { description } }
       }`,
      { guid: existente.guid, d: dashboard },
    );
    if (r.dashboardUpdate.errors?.length) throw new Error(JSON.stringify(r.dashboardUpdate.errors));
    return { acao: 'atualizado', guid: existente.guid, nome: dashboard.name };
  }

  const r = await nerdgraph(
    `mutation($conta: Int!, $d: DashboardInput!) {
       dashboardCreate(accountId: $conta, dashboard: $d) { entityResult { guid } errors { description } }
     }`,
    { conta: ACCOUNT_ID, d: dashboard },
  );
  if (r.dashboardCreate.errors?.length) throw new Error(JSON.stringify(r.dashboardCreate.errors));
  return { acao: 'criado', guid: r.dashboardCreate.entityResult.guid, nome: dashboard.name };
}

// ---------------------------------------------------------------------------
// Alertas — espelham observabilidade/alertas.md
// ---------------------------------------------------------------------------

// Eventos de log chegam esparsos: EVENT_TIMER fecha a janela depois de 60s sem
// dados, em vez de esperar o próximo evento (EVENT_FLOW), que pode demorar horas.
const sinalDeLog = (janela = 300) => ({ aggregationWindow: janela, aggregationMethod: 'EVENT_TIMER', aggregationTimer: 60 });
const sinalContinuo = (janela = 300) => ({ aggregationWindow: janela, aggregationMethod: 'EVENT_FLOW', aggregationDelay: 120 });
const termo = (priority, operator, threshold, thresholdDuration) => ({
  priority,
  operator,
  threshold,
  thresholdDuration,
  thresholdOccurrences: 'AT_LEAST_ONCE',
});

// O New Relic exige um termo CRITICAL em toda condição. As condições de nível
// "Warning" em alertas.md ganham um CRITICAL num patamar mais severo.
const CONDICOES = [
  {
    name: '01 Falha no processamento de ordens de serviço',
    description: 'Notificação ao cliente falhou; a OS avançou mas o cliente não foi avisado.',
    query: "SELECT count(*) FROM Log WHERE service = 'oficina-api' AND evento = 'falha_integracao'",
    signal: sinalDeLog(),
    terms: [termo('CRITICAL', 'ABOVE', 0, 300)],
  },
  {
    name: '02 Erro interno na aplicação',
    description: 'Exceção não tratada: resposta 500 ao usuário.',
    query: "SELECT count(*) FROM Log WHERE service = 'oficina-api' AND evento = 'erro_interno'",
    signal: sinalDeLog(),
    terms: [termo('CRITICAL', 'ABOVE', 3, 300)],
  },
  {
    name: '03 Banco de dados inacessível',
    description: 'readinessProbe falhando: os pods saem do balanceamento.',
    query: "SELECT count(*) FROM Log WHERE service = 'oficina-api' AND evento = 'readiness_falhou'",
    signal: sinalDeLog(60),
    terms: [termo('CRITICAL', 'ABOVE', 0, 180)],
  },
  {
    name: '04 Autenticação por CPF indisponível',
    description: 'Lambda com erro; nenhum cliente novo consegue entrar.',
    query: "SELECT count(*) FROM Log WHERE service = 'oficina-auth-lambda' AND level = 'error'",
    signal: sinalDeLog(),
    terms: [termo('CRITICAL', 'ABOVE', 2, 300)],
  },
  {
    name: '05 Latência degradada (p95)',
    description: 'A API responde, mas lentamente. Antecede a indisponibilidade.',
    query: "SELECT percentile(duration, 95) * 1000 FROM Transaction WHERE appName = 'oficina-api'",
    signal: sinalContinuo(),
    terms: [termo('CRITICAL', 'ABOVE', 3000, 300), termo('WARNING', 'ABOVE', 1000, 300)],
  },
  {
    name: '06 Taxa de erro 5xx no API Gateway',
    description: 'Percentual de respostas 5xx no access log do gateway.',
    query:
      "SELECT percentage(count(*), WHERE numeric(status) >= 500) FROM Log WHERE aws.logGroup LIKE '/aws/apigateway/oficina%'",
    signal: sinalDeLog(),
    terms: [termo('CRITICAL', 'ABOVE', 5, 300)],
  },
  {
    name: '07 Pods reiniciando',
    description: 'Crashloop ou OOMKill; costuma ser o primeiro sinal de um deploy ruim.',
    query: "SELECT sum(restartCountDelta) FROM K8sContainerSample WHERE containerName = 'oficina-api'",
    signal: sinalContinuo(),
    terms: [termo('CRITICAL', 'ABOVE', 5, 600), termo('WARNING', 'ABOVE', 2, 600)],
  },
  {
    name: '08 HPA no teto de réplicas',
    description: 'O autoscaling chegou ao maxReplicas; a próxima onda de tráfego degrada.',
    query: "SELECT latest(podsDesired) FROM K8sReplicasetSample WHERE deploymentName = 'oficina-api'",
    signal: sinalContinuo(),
    terms: [termo('CRITICAL', 'ABOVE_OR_EQUALS', 10, 1800), termo('WARNING', 'ABOVE_OR_EQUALS', 10, 600)],
  },
  {
    name: '10 Token forjado (segredo JWT vazado)',
    description: 'Assinatura válida com papel ou emissor incompatível. Rotacionar os segredos (ADR-0011).',
    query: "SELECT count(*) FROM Log WHERE service = 'oficina-api' AND evento = 'token_emissor_invalido'",
    signal: sinalDeLog(),
    terms: [termo('CRITICAL', 'ABOVE', 0, 300)],
  },
  {
    name: '11 Pico de bloqueios por limite de tentativas',
    description: 'Força bruta no login ou varredura da consulta pública (ADR-0012).',
    query:
      "SELECT count(*) FROM Log WHERE service = 'oficina-api' AND evento = 'erro_negocio' AND codigo = 'RATE_LIMITED'",
    signal: sinalDeLog(),
    terms: [termo('CRITICAL', 'ABOVE', 100, 300), termo('WARNING', 'ABOVE', 20, 300)],
  },
];

async function provisionarAlertas() {
  const busca = await nerdgraph(
    `query($conta: Int!, $nome: String!) {
       actor { account(id: $conta) { alerts { policiesSearch(searchCriteria: {name: $nome}) { policies { id name } } } } }
     }`,
    { conta: ACCOUNT_ID, nome: NOME_POLICY },
  );
  let policy = busca.actor.account.alerts.policiesSearch.policies.find((p) => p.name === NOME_POLICY);

  if (!policy) {
    const r = await nerdgraph(
      `mutation($conta: Int!, $p: AlertsPolicyInput!) { alertsPolicyCreate(accountId: $conta, policy: $p) { id name } }`,
      { conta: ACCOUNT_ID, p: { name: NOME_POLICY, incidentPreference: 'PER_CONDITION' } },
    );
    policy = r.alertsPolicyCreate;
  }

  const atuais = await nerdgraph(
    `query($conta: Int!, $policy: ID!) {
       actor { account(id: $conta) { alerts { nrqlConditionsSearch(searchCriteria: {policyId: $policy}) { nrqlConditions { id name } } } } }
     }`,
    { conta: ACCOUNT_ID, policy: policy.id },
  );
  const porNome = new Map(
    atuais.actor.account.alerts.nrqlConditionsSearch.nrqlConditions.map((c) => [c.name, c.id]),
  );

  const resultado = [];
  for (const c of CONDICOES) {
    const condicao = {
      name: c.name,
      description: c.description,
      enabled: true,
      nrql: { query: c.query },
      signal: c.signal,
      terms: c.terms,
      violationTimeLimitSeconds: 86400,
    };
    const id = porNome.get(c.name);
    if (id) {
      await nerdgraph(
        `mutation($conta: Int!, $id: ID!, $c: AlertsNrqlConditionUpdateStaticInput!) {
           alertsNrqlConditionStaticUpdate(accountId: $conta, id: $id, condition: $c) { id }
         }`,
        { conta: ACCOUNT_ID, id, c: condicao },
      );
      resultado.push(['atualizada', c.name]);
    } else {
      await nerdgraph(
        `mutation($conta: Int!, $policy: ID!, $c: AlertsNrqlConditionStaticInput!) {
           alertsNrqlConditionStaticCreate(accountId: $conta, policyId: $policy, condition: $c) { id }
         }`,
        { conta: ACCOUNT_ID, policy: policy.id, c: condicao },
      );
      resultado.push(['criada', c.name]);
    }
  }
  return { policy, resultado };
}

// ---------------------------------------------------------------------------

const dash = await provisionarDashboard();
console.log(`dashboard ${dash.acao}: ${dash.nome}`);

const { policy, resultado } = await provisionarAlertas();
console.log(`policy de alertas: ${policy.name} (id ${policy.id})`);
for (const [acao, nome] of resultado) console.log(`  condição ${acao}: ${nome}`);
