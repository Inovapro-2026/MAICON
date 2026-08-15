/**
 * Templates de e-mail do onboarding/transacional — SAVYRON.
 * Sem referências a "barbearia" ou "AgendaCorte" como regra.
 */
import { brandHeaderHtml } from "./brand";

export function buildOtpEmail(
  code: string,
  minutes: number,
): { subject: string; text: string; html: string } {
  const subject = "Seu código de verificação — SAVYRON";
  const text = [
    "Olá!",
    "",
    `Seu código de verificação é: ${code}`,
    "",
    `Ele expira em ${minutes} minutos. Se você não solicitou este código, ignore este e-mail.`,
    "",
    "SAVYRON",
  ].join("\n");
  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #18181b;">
    ${brandHeaderHtml()}
    <p>Seu código de verificação é:</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #059669; margin: 12px 0;">${code}</p>
    <p>Ele expira em <strong>${minutes} minutos</strong>.</p>
    <p style="color: #71717a;">Se você não solicitou este código, pode ignorar este e-mail.</p>
    <p style="color: #a1a1aa; font-size: 12px;">© SAVYRON</p>
  </div>`;
  return { subject, text, html };
}

export function buildAccountActivatedEmail(businessName: string): {
  subject: string;
  text: string;
  html: string;
} {
  const name = businessName || "sua empresa";
  const subject = "Sua conta foi ativada — SAVYRON";
  const text = [
    `Olá! A assinatura de ${name} foi confirmada.`,
    "",
    "Sua conta está ativa e você já pode acessar o painel.",
    "",
    "SAVYRON",
  ].join("\n");
  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #18181b;">
    ${brandHeaderHtml()}
    <p>Sua assinatura foi <strong>confirmada</strong> e a conta de <strong>${name.replace(/</g, "&lt;")}</strong> está ativa.</p>
    <p>Você já pode acessar o painel e configurar sua empresa.</p>
    <p style="color: #a1a1aa; font-size: 12px;">© SAVYRON</p>
  </div>`;
  return { subject, text, html };
}
