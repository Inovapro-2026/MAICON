/**
 * Branding para e-mails transacionais — SAVYRON.
 * Logo oficial hospedada no frontend público (mesma imagem do dashboard).
 */
import { config } from "@prospector/config";

export const brandLogoUrl = `${config.app.url}/logo.png`;

/** Header de e-mail: logo da marca (alt como fallback quando imagens bloqueadas). */
export function brandHeaderHtml(extraStyle = ""): string {
  return `<img src="${brandLogoUrl}" alt="SAVYRON" style="height: 44px; width: auto; margin: 0 0 16px; display: block;${extraStyle}" />`;
}
