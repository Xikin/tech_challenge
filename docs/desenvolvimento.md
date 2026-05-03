# Desenvolvimento

---

## Execução local

```bash
# Instala dependências
npm install

# Configura banco
cp .env.example .env
npm run db:migrate
npm run db:seed

# Inicia com hot-reload
npm run dev
```

---

## Testes

```bash
# Todos os testes
npm test

# Com relatório de cobertura (≥ 80%)
npm run test:coverage

# Modo watch
npm run test:watch
```

---

## Variáveis de ambiente

| Variável         | Padrão | Descrição                    |
| ---------------- | ------ | ---------------------------- |
| `DATABASE_URL`   | —      | Connection string PostgreSQL |
| `JWT_SECRET`     | —      | Chave JWT (mín. 32 chars)    |
| `JWT_EXPIRES_IN` | `8h`   | Expiração do token           |
| `BCRYPT_ROUNDS`  | `12`   | Rounds bcrypt (use 4 em dev) |
| `PORT`           | `3000` | Porta da API                 |

---

## Comandos úteis

```bash
npm run db:migrate    # Aplica migrations pendentes
npm run db:studio     # Abre Prisma Studio (GUI)
npm run db:seed       # Popula dados iniciais
npm run build         # Compila TypeScript
```
