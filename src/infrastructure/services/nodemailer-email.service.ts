import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import type {
  IEmailService,
  EnviarEmailStatusInput,
  EnviarEmailAprovacaoInput,
} from '../../domain/services/email.service.interface';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export class NodemailerEmailService implements IEmailService {
  private transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

  constructor() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
    }
  }

  async enviarStatusAtualizado(dados: EnviarEmailStatusInput): Promise<void> {
    if (!this.transporter) return;
    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to: dados.destinatario,
      subject: `OS #${dados.numeroOS} — Status atualizado: ${dados.statusNovo}`,
      html: `
        <h2>Atualização da Ordem de Serviço #${dados.numeroOS}</h2>
        <p>Olá, <strong>${escapeHtml(dados.nomeCliente)}</strong>!</p>
        <p>Sua ordem de serviço teve o status atualizado:</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px;font-weight:bold">De:</td><td style="padding:4px 12px">${escapeHtml(dados.statusAnterior)}</td></tr>
          <tr><td style="padding:4px 12px;font-weight:bold">Para:</td><td style="padding:4px 12px;color:#1a7f37">${escapeHtml(dados.statusNovo)}</td></tr>
          ${dados.observacao ? `<tr><td style="padding:4px 12px;font-weight:bold">Observação:</td><td style="padding:4px 12px">${escapeHtml(dados.observacao)}</td></tr>` : ''}
        </table>
      `,
    });
  }

  async enviarAprovacaoSolicitada(dados: EnviarEmailAprovacaoInput): Promise<void> {
    if (!this.transporter) return;
    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to: dados.destinatario,
      subject: `OS #${dados.numeroOS} — Orçamento aguardando aprovação`,
      html: `
        <h2>Orçamento aguardando sua aprovação — OS #${dados.numeroOS}</h2>
        <p>Olá, <strong>${escapeHtml(dados.nomeCliente)}</strong>!</p>
        <p>O diagnóstico foi concluído. <strong>Valor total: R$ ${dados.valorTotal.toFixed(2)}</strong></p>
        <p>Entre em contato com a oficina para aprovar ou recusar o orçamento.</p>
      `,
    });
  }
}
