# ADR-0003: Autoscaling horizontal via HPA

**Status:** Aceita

## Contexto

O desafio exige um cluster Kubernetes com escalabilidade, já que a carga varia — picos em horário comercial, baixa demanda fora dele. A API precisa crescer e encolher automaticamente sem intervenção manual, mantendo alta disponibilidade mesmo em baixa carga.

## Decisão

Usar um `HorizontalPodAutoscaler` ([`k8s/hpa.yaml`](../../k8s/hpa.yaml)) sobre o Deployment `oficina-api`:

- **Réplicas:** mínimo 2 (garante HA — nunca há só um pod), máximo 10.
- **Métricas:** utilização de CPU (alvo 70%) e memória (alvo 80%), o que vier primeiro dispara o scale-out.

Não foi adotado HPA baseado em métricas customizadas (ex.: requisições/segundo via Prometheus Adapter) nesta fase.

## Consequências

**Positivas:**
- Escala automática sem intervenção manual, atendendo ao requisito de "cluster Kubernetes com escalabilidade".
- Baseline de 2 réplicas evita ponto único de falha mesmo com tráfego baixo.

**Negativas:**
- CPU/memória são proxies indiretos de carga real — não capturam gargalos de I/O (ex.: banco lento) ou fila de conexões.
- Se o gargalo real for o PostgreSQL (não replicado horizontalmente), escalar a API não resolve — o HPA cobre só a camada de aplicação.

**Reavaliar se:** métricas de latência (Fase 3 exige monitorar latência das APIs) mostrarem que CPU/memória não refletem os picos reais — migrar para HPA customizado nesse caso.
