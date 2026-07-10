import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding...');

  const adminHash = await bcrypt.hash('Admin@123', 12);
  await prisma.usuario.upsert({
    where: { email: 'admin@oficina.com' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@oficina.com',
      senha: adminHash,
      role: Role.ADMIN,
    },
  });

  const funcHash = await bcrypt.hash('Func@123', 12);
  await prisma.usuario.upsert({
    where: { email: 'funcionario@oficina.com' },
    update: {},
    create: {
      nome: 'João Mecânico',
      email: 'funcionario@oficina.com',
      senha: funcHash,
      role: Role.FUNCIONARIO,
    },
  });

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

  console.log('✅ Seed concluído!');
  console.log('👤 admin@oficina.com / Admin@123');
  console.log('👤 funcionario@oficina.com / Func@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
