import { firstContactMessage } from "@prospector/ai";
import { brandHeaderHtml } from "./brand";

export interface EmailTemplates {
  subject: string;
  text: string;
  html: string;
}

/** E-mail de primeira abordagem para campanha. */
export function firstContactEmail(businessName: string | null): EmailTemplates {
  const greeting = businessName
    ? `Olá, falo com o responsável pelo ${businessName.trim()}?`
    : firstContactMessage(null);
  const text = [
    greeting,
    "",
    "Meu nome é equipe da empresa. Ficamos felizes em poder conversar com você.",
    "",
    "Se preferir, é só responder este e-mail que eu explico direitinho.",
    "",
    "Atenciosamente,",
    "SAVYRON",
  ].join("\n");

  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #18181b;">
    ${brandHeaderHtml()}
    <p>${(greeting || "").replace(/</g, "&lt;")}</p>
    <p>Ficamos felizes em poder conversar com você.</p>
    <p>Se preferir, é só responder este e-mail que eu explico direitinho.</p>
    <br/>
    <p style="color: #71717a;">Atenciosamente,<br/>SAVYRON</p>
  </div>`;

  return {
    subject: `Falo com o responsável pelo ${businessName ? businessName.trim() : "estabelecimento"}?`,
    text,
    html,
  };
}

/** E-mail de retorno com interesse (genérico SAVYRON). */
export function registrationEmail(leadName: string | null): EmailTemplates {
  const name = leadName ? leadName.trim() : "Olá";
  const text = [
    `${name}!`,
    "",
    "Que ótimo saber que você tem interesse em saber mais!",
    "",
    "Nossa equipe vai entrar em contato para te passar todas as informações.",
    "",
    "Qualquer dúvida, é só responder este e-mail.",
    "",
    "SAVYRON",
  ].join("\n");

  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #18181b;">
    ${brandHeaderHtml()}
    <p>${(name || "Olá").replace(/</g, "&lt;")}!</p>
    <p>Que ótimo saber que você tem interesse em saber mais!</p>
    <p>Nossa equipe vai entrar em contato para te passar todas as informações.</p>
    <p style="color: #71717a;">Qualquer dúvida, é só responder este e-mail.</p>
    <p style="color: #71717a;">SAVYRON</p>
  </div>`;

  return {
    subject: "Recebemos o seu interesse",
    text,
    html,
  };
}
