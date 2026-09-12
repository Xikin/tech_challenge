import { randomBytes } from 'node:crypto';
import { PrismaClient, Role, TipoPessoa, StatusOS } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Mesma política de `criarUsuarioSchema` (src/presentation/http/schemas/auth.schema.ts).
const POLITICA_SENHA = [/.{8,}/, /[A-Z]/, /[0-9]/, /[@$!%*?&]/];

interface SenhaSeed {
  valor: string;
  origem: 'variavel' | 'padrao-dev' | 'gerada';
}

/**
 * Senha dos usuários internos criados pelo seed.
 *
 * Até a revisão de segurança da Fase 3 a senha `Admin@123` era fixa no código,
 * e o seed chegou a rodar no ambiente publicado: qualquer pessoa com acesso ao
 * repositório entrava como ADMIN pela URL pública. Agora, por precedência:
 *
 *   1. variável de ambiente (SEED_ADMIN_PASSWORD / SEED_FUNCIONARIO_PASSWORD),
 *      validada contra a política de senha;
 *   2. a senha de desenvolvimento, SOMENTE com SEED_PERMITIR_SENHA_PADRAO=true
 *      (ligado no .env.example para o ambiente local e a collection Postman);
 *   3. senha aleatória forte, exibida uma única vez no terminal.
 */
function senhaDoSeed(variavel: string, padraoDesenvolvimento: string): SenhaSeed {
  const definida = process.env[variavel];
  if (definida) {
    if (!POLITICA_SENHA.every((regra) => regra.test(definida))) {
      throw new Error(
        `${variavel} não atende à política de senha: 8+ caracteres, maiúscula, número e um de @$!%*?&`,
      );
    }
    return { valor: definida, origem: 'variavel' };
  }

  if (process.env.SEED_PERMITIR_SENHA_PADRAO === 'true') {
    return { valor: padraoDesenvolvimento, origem: 'padrao-dev' };
  }

  // O prefixo garante a política; o restante são 144 bits aleatórios.
  return { valor: `Aa1@${randomBytes(18).toString('base64url')}`, origem: 'gerada' };
}

async function garantirUsuario(
  email: string,
  nome: string,
  role: Role,
  senha: SenhaSeed,
): Promise<string> {
  // Usuário existente não tem a senha alterada: exibir uma senha "gerada" que
  // não foi aplicada seria pior do que não exibir nada.
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) return `👤 ${email}: já existia — senha mantida`;

  await prisma.usuario.create({
    data: { nome, email, role, senha: await bcrypt.hash(senha.valor, 12) },
  });

  if (senha.origem === 'variavel') return `👤 ${email}: criado com a senha da variável de ambiente`;
  if (senha.origem === 'padrao-dev')
    return `👤 ${email} / ${senha.valor}  ⚠ senha padrão de DESENVOLVIMENTO — nunca use em ambiente publicado`;
  return `👤 ${email} / ${senha.valor}  (gerada agora — guarde, não será exibida de novo)`;
}

async function main() {
  console.log('🌱 Seeding...');

  const usuarios = [
    await garantirUsuario(
      'admin@oficina.com',
      'Administrador',
      Role.ADMIN,
      senhaDoSeed('SEED_ADMIN_PASSWORD', 'Admin@123'),
    ),
    await garantirUsuario(
      'funcionario@oficina.com',
      'João Mecânico',
      Role.FUNCIONARIO,
      senhaDoSeed('SEED_FUNCIONARIO_PASSWORD', 'Func@123'),
    ),
  ];

  const servicos = [
    { nome: 'Troca de Óleo', preco: 89.9, tempoPrevisto: 30 },
    { nome: 'Alinhamento e Balanceamento', preco: 120.0, tempoPrevisto: 60 },
    { nome: 'Revisão Geral', preco: 350.0, tempoPrevisto: 240 },
    { nome: 'Troca de Pastilha de Freio', preco: 200.0, tempoPrevisto: 90 },
    { nome: 'Diagnóstico Eletrônico', preco: 80.0, tempoPrevisto: 30 },
  ];

  for (const s of servicos) {
    const existe = await prisma.servico.findFirst({ where: { nome: s.nome } });
    if (!existe) await prisma.servico.create({ data: s });
  }

  const pecas = [
    { nome: 'Óleo Motor 5W30', preco: 28.0, quantidade: 50, estoqueMin: 10, unidade: 'L' },
    { nome: 'Filtro de Óleo', preco: 22.0, quantidade: 30, estoqueMin: 5, unidade: 'un' },
    {
      nome: 'Pastilha de Freio Dianteira',
      preco: 85.0,
      quantidade: 15,
      estoqueMin: 3,
      unidade: 'jg',
    },
    { nome: 'Filtro de Ar', preco: 45.0, quantidade: 20, estoqueMin: 5, unidade: 'un' },
    { nome: 'Vela de Ignição NGK', preco: 35.0, quantidade: 40, estoqueMin: 8, unidade: 'un' },
  ];

  for (const p of pecas) {
    const existe = await prisma.peca.findFirst({ where: { nome: p.nome } });
    if (!existe) await prisma.peca.create({ data: p });
  }

  // ---------------------------------------------------------------------------
  // Clientes de demonstração da autenticação por CPF (Fase 3).
  //
  // Os CPFs são sintéticos, mas com dígito verificador válido — senão a Lambda
  // os rejeitaria com 422 antes de consultar o banco. Cada um cobre um caminho
  // do fluxo:
  //
  //   529.982.247-25  Ana    ativa, com e-mail    -> 200, token com claim email
  //   111.444.777-35  Bruno  ativo, sem e-mail    -> 200, token sem claim email
  //   123.456.789-09  Carla  INATIVA              -> 403 CLIENT_INACTIVE
  //
  // Ana e Bruno ganham uma OS cada, para demonstrar a autorização por dono:
  // com o token da Ana, a OS da Ana responde 200 e a do Bruno responde 403.
  // ---------------------------------------------------------------------------
  const trocaDeOleo = await prisma.servico.findFirstOrThrow({ where: { nome: 'Troca de Óleo' } });

  const clientesDemo = [
    {
      nome: 'Ana Souza',
      cpfCnpj: '52998224725',
      email: 'ana.souza@example.com',
      ativo: true,
      veiculo: { placa: 'ABC1D23', marca: 'Volkswagen', modelo: 'Gol', ano: 2019, cor: 'Prata' },
    },
    {
      nome: 'Bruno Lima',
      cpfCnpj: '11144477735',
      email: null,
      ativo: true,
      veiculo: { placa: 'BRA2E19', marca: 'Fiat', modelo: 'Argo', ano: 2021, cor: 'Branco' },
    },
    {
      nome: 'Carla Mendes',
      cpfCnpj: '12345678909',
      email: 'carla.mendes@example.com',
      ativo: false,
      veiculo: null,
    },
  ];

  for (const c of clientesDemo) {
    const cliente = await prisma.cliente.upsert({
      where: { cpfCnpj: c.cpfCnpj },
      update: { ativo: c.ativo },
      create: {
        nome: c.nome,
        cpfCnpj: c.cpfCnpj,
        tipoPessoa: TipoPessoa.FISICA,
        email: c.email,
        ativo: c.ativo,
      },
    });

    if (!c.veiculo) continue;

    const veiculo = await prisma.veiculo.upsert({
      where: { placa: c.veiculo.placa },
      update: {},
      create: { ...c.veiculo, clienteId: cliente.id },
    });

    const jaTemOS = await prisma.ordemServico.count({ where: { clienteId: cliente.id } });
    if (jaTemOS > 0) continue;

    await prisma.ordemServico.create({
      data: {
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        status: StatusOS.RECEBIDA,
        descricao: 'OS de demonstração — troca de óleo',
        valorTotal: trocaDeOleo.preco,
        servicos: { create: [{ servicoId: trocaDeOleo.id, preco: trocaDeOleo.preco }] },
        historico: {
          create: [
            { statusNovo: StatusOS.RECEBIDA, observacao: 'Criada pelo seed de demonstração' },
          ],
        },
      },
    });
  }

  console.log('✅ Seed concluído!');
  for (const linha of usuarios) console.log(linha);
  console.log('🪪 CPF ativo:   529.982.247-25 (Ana, com e-mail)');
  console.log('🪪 CPF ativo:   111.444.777-35 (Bruno, sem e-mail)');
  console.log('🪪 CPF inativo: 123.456.789-09 (Carla)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
