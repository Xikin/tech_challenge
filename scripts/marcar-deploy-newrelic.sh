#!/usr/bin/env bash
set -euo pipefail

if [ -z "${NEW_RELIC_API_KEY:-}" ] || [ -z "${NEW_RELIC_ACCOUNT_ID:-}" ]; then
  echo "::notice::NEW_RELIC_API_KEY ou NEW_RELIC_ACCOUNT_ID não configurados — marcador de deploy ignorado."
  exit 0
fi

nerdgraph() {
  curl -sS https://api.newrelic.com/graphql \
    -H 'Content-Type: application/json' -H "API-Key: $NEW_RELIC_API_KEY" --data-binary @-
}

GUID=$(jq -n --arg q "accountId = $NEW_RELIC_ACCOUNT_ID AND domain = 'APM' AND name = '$NR_APP'" \
  '{query: "query($q: String!) { actor { entitySearch(query: $q) { results { entities { guid } } } } }", variables: {q: $q}}' \
  | nerdgraph | jq -r '.data.actor.entitySearch.results.entities[0].guid // empty')

if [ -z "$GUID" ]; then
  echo "::notice::A entidade $NR_APP ainda não existe no New Relic — marcador ignorado."
  exit 0
fi

jq -n --arg guid "$GUID" --arg versao "$GITHUB_SHA" --arg usuario "$GITHUB_ACTOR" \
  --arg descricao "Deploy ${APP_ENV} de ${NR_APP} pelo GitHub Actions (run ${GITHUB_RUN_ID})" \
  '{query: "mutation($d: ChangeTrackingDeploymentInput!) { changeTrackingCreateDeployment(deployment: $d) { deploymentId } }",
    variables: {d: {entityGuid: $guid, version: $versao, commit: $versao, user: $usuario, description: $descricao, deploymentType: "ROLLING"}}}' \
  | nerdgraph > nr-deploy.json

if jq -e '.data.changeTrackingCreateDeployment.deploymentId' nr-deploy.json >/dev/null; then
  echo "Marcador de deploy registrado para ${GITHUB_SHA}."
else
  echo "::warning::O New Relic não registrou o marcador de deploy:"
  cat nr-deploy.json
fi
