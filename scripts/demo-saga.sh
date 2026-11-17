#!/usr/bin/env bash
set -euo pipefail

CENARIO="${1:-feliz}"
OS_URL="${OS_URL:-http://localhost:3000}"
EXECUCAO_URL="${EXECUCAO_URL:-$OS_URL}"
BILLING_URL="${BILLING_URL:-$OS_URL}"
EMAIL="${DEMO_EMAIL:-funcionario@oficina.com}"
SENHA="${DEMO_SENHA:-Func@123}"
CPF="${DEMO_CPF:-52998224725}"
ESPERA="${DEMO_ESPERA:-3}"

case "$CENARIO" in
  feliz | reprovado | falha) ;;
  *)
    echo "Uso: $0 [feliz|reprovado|falha]" >&2
    exit 1
    ;;
esac

passo() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
pausa() { sleep "$ESPERA"; }
json() { curl -sS --fail-with-body -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' "$@"; }
status_os() { json "$OS_URL/ordens/$OS" | jq -r '"OS #\(.numero): \(.status)  |  saga \(.saga.status) na etapa \(.saga.etapa)"'; }

passo "Login do funcionário"
TOKEN="${DEMO_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  TOKEN=$(curl -sS --fail-with-body -X POST "$OS_URL/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"senha\":\"$SENHA\"}" | jq -r .token)
fi

CLIENTE=$(json "$OS_URL/clientes/cpf-cnpj/$CPF" | jq -r .id)
VEICULO=$(json "$OS_URL/veiculos?clienteId=$CLIENTE" | jq -r '.[0].id')

passo "Abrir a OS (OS Service grava a OS, a saga e o comando no outbox)"
OS=$(json -X POST "$OS_URL/ordens" -d "{\"clienteId\":\"$CLIENTE\",\"veiculoId\":\"$VEICULO\",\"descricao\":\"Demonstração: $CENARIO\"}" | jq -r .id)
pausa
status_os

passo "Mecânico pega a OS na fila do serviço de execução"
EXECUCAO=$(json "$EXECUCAO_URL/execucoes/ordem/$OS" | jq -r .id)
json -X POST "$EXECUCAO_URL/execucoes/$EXECUCAO/diagnostico/iniciar" -d '{}' | jq -c '{execucao: .status}'
pausa
status_os

passo "Mecânico conclui o diagnóstico (reserva as peças no estoque)"
SERVICO=$(json "$EXECUCAO_URL/servicos?busca=Pastilha" | jq -r '.data[0].id')
PECA=$(json "$EXECUCAO_URL/pecas?busca=Pastilha" | jq -r '.data[0].id')
ESTOQUE_ANTES=$(json "$EXECUCAO_URL/pecas/$PECA" | jq -r .quantidade)
json -X POST "$EXECUCAO_URL/execucoes/$EXECUCAO/diagnostico/concluir" \
  -d "{\"servicos\":[{\"servicoId\":\"$SERVICO\"}],\"pecas\":[{\"pecaId\":\"$PECA\",\"quantidade\":1}],\"observacao\":\"Pastilhas no limite\"}" \
  | jq -c '{execucao: .status, reservas: [.reservas[] | "\(.quantidade)x \(.nome) \(.status)"]}'
echo "Estoque da pastilha: $ESTOQUE_ANTES → $(json "$EXECUCAO_URL/pecas/$PECA" | jq -r .quantidade)"
pausa
status_os

passo "Orçamento gerado pelo Billing (MongoDB)"
ORCAMENTO=$(json "$BILLING_URL/orcamentos/ordem/$OS")
ORCAMENTO_ID=$(echo "$ORCAMENTO" | jq -r .id)
echo "$ORCAMENTO" | jq -c '{status, valorTotal, itens: [.itens[] | "\(.quantidade)x \(.nome) R$ \(.precoUnitario)"]}'

if [ "$CENARIO" = "reprovado" ]; then
  passo "Cliente reprova o orçamento → saga compensa"
  json -X POST "$BILLING_URL/orcamentos/$ORCAMENTO_ID/reprovar" -d '{"motivo":"Achei caro"}' | jq -c '{orcamento: .status}'
else
  passo "Cliente aprova o orçamento (cobrança no Mercado Pago)"
  json -X POST "$BILLING_URL/orcamentos/$ORCAMENTO_ID/aprovar" -d '{}' | jq -c '{orcamento: .status, link: .pagamento.linkPagamento}'
  pausa
  status_os

  passo "Pagamento confirmado (simulador do Mercado Pago)"
  curl -sS --fail-with-body -X POST "$BILLING_URL/pagamentos/simulador/$ORCAMENTO_ID" \
    -H 'content-type: application/json' -d '{"aprovado":true}' | jq -c .
  pausa
  status_os

  passo "Mecânico inicia o reparo"
  json -X POST "$EXECUCAO_URL/execucoes/$EXECUCAO/reparo/iniciar" -d '{}' | jq -c '{execucao: .status}'
  pausa
  status_os

  if [ "$CENARIO" = "falha" ]; then
    passo "Mecânico registra falha no reparo → saga estorna o pagamento"
    json -X POST "$EXECUCAO_URL/execucoes/$EXECUCAO/falha" -d '{"motivo":"Pinça de freio trincada"}' | jq -c '{execucao: .status}'
  else
    passo "Mecânico finaliza o reparo"
    json -X POST "$EXECUCAO_URL/execucoes/$EXECUCAO/reparo/finalizar" -d '{"tempoRealMin":80}' | jq -c '{execucao: .status, tempoRealMin}'
  fi
fi

pausa
pausa
if [ "$CENARIO" = "feliz" ]; then
  passo "Atendente entrega o veículo"
  json -X PATCH "$OS_URL/ordens/$OS/entregar" -d '{}' | jq -c '{status}'
fi

passo "Resultado"
status_os
json "$BILLING_URL/orcamentos/$ORCAMENTO_ID" | jq -c '{orcamento: .status, pagamento: .pagamento.status}'
json "$EXECUCAO_URL/execucoes/$EXECUCAO" | jq -c '{execucao: .status, reservas: [.reservas[].status]}'
echo "Estoque da pastilha agora: $(json "$EXECUCAO_URL/pecas/$PECA" | jq -r .quantidade)"

passo "Histórico da OS"
json "$OS_URL/ordens/$OS" | jq -r '.historico[] | "  \(.statusAnterior // "—") → \(.statusNovo): \(.observacao)"'

passo "Passos da saga (GET /ordens/$OS/saga)"
json "$OS_URL/ordens/$OS/saga" | jq -r '.passos[] | "  \(.direcao)\t\(.tipo)"'
