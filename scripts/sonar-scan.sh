set -e

TOKEN="${1:-${SONAR_TOKEN:-}}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Oficina Mecânica — SonarQube Scan"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -z "$TOKEN" ] && ! grep -q "^SONAR_TOKEN=." .env 2>/dev/null; then
  echo ""
  echo "⚠  SONAR_TOKEN não encontrado nem no ambiente nem no .env"
  echo "   Defina-o antes de rodar:"
  echo "   echo 'SONAR_TOKEN=sqa_...' >> .env"
  echo "   ou: SONAR_TOKEN=sqa_... npm run sonar"
  exit 1
fi

echo ""
echo "▶ 1/3  Gerando cobertura de testes..."
npm run test:coverage

if [ ! -f "coverage/lcov.info" ]; then
  echo "✖  coverage/lcov.info não encontrado. Abortando."
  exit 1
fi
echo "✔  Cobertura gerada: coverage/lcov.info"

echo ""
echo "▶ 2/3  Subindo SonarQube..."
docker compose up -d sonar_postgres sonarqube

echo "   Aguardando SonarQube ficar pronto (pode levar ~2 min)..."
until docker compose exec sonarqube wget -qO- http://localhost:9000/api/system/status 2>/dev/null | grep -q '"status":"UP"'; do
  printf '.'
  sleep 5
done
echo ""
echo "✔  SonarQube disponível em http://localhost:9000"

echo ""
echo "▶ 3/3  Executando análise..."
# Se o token foi passado via argumento ou shell env, repassa explicitamente.
# Caso contrário, deixa o docker compose ler SONAR_TOKEN direto do .env.
if [ -n "$TOKEN" ]; then
  SONAR_TOKEN="${TOKEN}" docker compose --profile scan run --rm sonar_scanner
else
  docker compose --profile scan run --rm sonar_scanner
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✔  Scan concluído!"
echo "  📊 Relatório: http://localhost:9000/dashboard?id=oficina-mvp"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
