# ADR-0002: Comunicação síncrona via REST/HTTP

**Status:** Aceita

## Contexto

Os módulos da aplicação (clientes, veículos, ordens de serviço, serviços, peças) precisam se comunicar entre si e com clientes externos (frontend, Postman, e futuramente o API Gateway da Fase 3). O volume de requisições de uma oficina não é alto o bastante para justificar processamento desacoplado, e não há hoje nenhuma fila de mensagens (RabbitMQ, SQS, Kafka) no projeto.

## Decisão

Toda comunicação é síncrona via REST/HTTP, servida pelo Fastify: o cliente faz a requisição e recebe a resposta (sucesso ou erro) no mesmo ciclo, sem filas ou eventos intermediários. Efeitos colaterais como o envio de e-mail de notificação (mudança de status da OS, orçamento pronto) acontecem dentro do próprio fluxo da requisição, via `nodemailer-email.service.ts`.

## Consequências

**Positivas:**
- Simplicidade operacional: não há infraestrutura de mensageria para provisionar, monitorar ou versionar.
- Latência previsível e depuração direta (uma requisição = uma resposta = um trace).

**Negativas:**
- Acoplamento temporal: se o PostgreSQL ou o SMTP estiverem indisponíveis, a operação falha imediatamente para o cliente, sem buffer de retry automático.
- Envio de e-mail síncrono adiciona latência à resposta HTTP da rota que o dispara.

**Reavaliar se:** a Fase 3 introduzir picos de carga relevantes ou notificações em massa que justifiquem desacoplar via fila/evento — hoje não há esse requisito.
