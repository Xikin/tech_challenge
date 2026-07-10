#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="oficina"
IMAGE_NAME="${1:-oficina:local}"
CLUSTER_NAME="${2:-oficina}"

echo "==> Carregando imagem '$IMAGE_NAME' no cluster Kind '$CLUSTER_NAME'..."
kind load docker-image "$IMAGE_NAME" --name "$CLUSTER_NAME"

echo "==> Aplicando manifestos Kubernetes..."
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/postgres-pvc.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/postgres-service.yaml
sed "s|DOCKER_IMAGE_PLACEHOLDER|$IMAGE_NAME|g" k8s/api-deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/api-service.yaml
kubectl apply -f k8s/hpa.yaml

echo "==> Aguardando PostgreSQL ficar pronto..."
kubectl rollout status deployment/postgres -n "$NAMESPACE" --timeout=120s

echo "==> Aguardando API ficar pronta..."
kubectl rollout status deployment/oficina-api -n "$NAMESPACE" --timeout=120s

echo ""
echo "==> Deploy concluido!"
echo "    API disponivel em: http://localhost:30000/health"
