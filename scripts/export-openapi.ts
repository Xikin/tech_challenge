/**
 * Exporta a especificação OpenAPI para docs/openapi.json.
 *
 * O entregável da Fase 3 exige "link para o Swagger/Postman das APIs" no
 * README. Depender de `/docs` num ambiente no ar significa que o link quebra
 * assim que o cluster é destruído para poupar crédito. Versionar o
 * openapi.json garante que a especificação esteja sempre disponível — e
 * qualquer Swagger UI hospedado consegue renderizá-la.
 *
 * Rodado no CI a cada push (ver .github/workflows/ci-cd.yml).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// A validação de env exige DATABASE_URL e os dois segredos JWT (distintos);
// nada aqui toca o banco, então valores sintéticos bastam para instanciar o app
// e ler o schema.
process.env.NODE_ENV ??= 'development';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/placeholder';
process.env.JWT_SECRET ??= 'placeholder-para-exportar-openapi-32-chars';
process.env.JWT_CLIENTE_SECRET ??= 'placeholder-cliente-para-exportar-openapi-32';
process.env.SWAGGER_ENABLED = 'true';

async function exportar() {
  const { buildApp } = await import('../src/app');

  const app = await buildApp();
  await app.ready();

  const spec = app.swagger();
  const destino = resolve(__dirname, '..', 'docs', 'openapi.json');

  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, `${JSON.stringify(spec, null, 2)}\n`, 'utf-8');

  const rotas = Object.keys((spec as { paths?: object }).paths ?? {}).length;
  console.log(`OpenAPI exportado para ${destino} (${rotas} caminhos)`);

  await app.close();
}

exportar().catch((erro) => {
  console.error('Falha ao exportar OpenAPI:', erro);
  process.exit(1);
});
