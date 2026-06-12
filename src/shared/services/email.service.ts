import nodemailer from "nodemailer";
import { env } from "../../config/env";

function createTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

export async function enviarEmailStatusOS(dados: {
  destinatario: string;
  nomeCliente: string;
  numeroOS: number;
  statusAnterior: string;
  statusNovo: string;
  observacao?: string;
}): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) return;

  const html = `
    <h2>Atualização da Ordem de Serviço #${dados.numeroOS}</h2>
    <p>Olá, <strong>${dados.nomeCliente}</strong>!</p>
    <p>Sua ordem de serviço teve o status atualizado:</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:4px 12px;font-weight:bold">De:</td>
        <td style="padding:4px 12px">${dados.statusAnterior}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px;font-weight:bold">Para:</td>
        <td style="padding:4px 12px;color:#1a7f37">${dados.statusNovo}</td>
      </tr>
      ${dados.observacao ? `<tr><td style="padding:4px 12px;font-weight:bold">Observação:</td><td style="padding:4px 12px">${dados.observacao}</td></tr>` : ""}
    </table>
    <p>Para acompanhar sua OS, acesse o portal do cliente com o número <strong>${dados.numeroOS}</strong> e seu CPF/CNPJ.</p>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: dados.destinatario,
    subject: `OS #${dados.numeroOS} — Status atualizado: ${dados.statusNovo}`,
    html,
  });
}

export async function enviarEmailAprovacaoSolicitada(dados: {
  destinatario: string;
  nomeCliente: string;
  numeroOS: number;
  valorTotal: number;
}): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) return;

  const html = `
    <h2>Orçamento aguardando sua aprovação — OS #${dados.numeroOS}</h2>
    <p>Olá, <strong>${dados.nomeCliente}</strong>!</p>
    <p>O diagnóstico do seu veículo foi concluído e o orçamento está pronto para aprovação.</p>
    <p><strong>Valor total: R$ ${dados.valorTotal.toFixed(2)}</strong></p>
    <p>Entre em contato com a oficina ou acesse o portal do cliente para aprovar ou recusar o orçamento.</p>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: dados.destinatario,
    subject: `OS #${dados.numeroOS} — Orçamento aguardando aprovação`,
    html,
  });
}
