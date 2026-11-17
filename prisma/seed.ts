import { randomBytes } from 'node:crypto';
import { PrismaClient, Role, TipoPessoa } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const POLITICA_SENHA = [/.{8,}/, /[A-Z]/, /[0-9]/, /[@$!%*?&]/];

interface SenhaSeed {
  valor: string;
  origem: 'variavel' | 'padrao-dev' | 'gerada';
}

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

  return { valor: `Aa1@${randomBytes(18).toString('base64url')}`, origem: 'gerada' };
}

async function garantirUsuario(
  email: string,
  nome: string,
  role: Role,
  senha: SenhaSeed,
): Promise<string> {
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

    await prisma.veiculo.upsert({
      where: { placa: c.veiculo.placa },
      update: {},
      create: { ...c.veiculo, clienteId: cliente.id },
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
