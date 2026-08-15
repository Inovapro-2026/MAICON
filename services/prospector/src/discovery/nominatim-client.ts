/**
 * Geocoding de país/estado/cidade para bounding box via Nominatim (OpenStreetMap).
 * Usado pela Overpass API para restringir a busca à região alvo.
 * Respeita a política de uso: User-Agent identificável, 1 request por busca.
 */
import { createLogger } from "@prospector/logger";
import { withRetry } from "@prospector/utils";
import { GeoBBox } from "./overpass-query";

const logger = createLogger("prospector.nominatim");

const USER_AGENT =
  "SAVYRON-Prospector/1.0 (prospecção comercial automatizada; contato: ops@inovapro.cloud)";

export interface NominatimClientOptions {
  apiUrl: string;
  timeoutMs: number;
}

interface NominatimResult {
  boundingbox?: string[];
}

/**
 * Resolve a bounding box da região alvo. Retorna null quando a localização não
 * é encontrada — o provider transforma isso em falha explícita (nunca silenciosa).
 */
export async function geocodeRegion(
  params: { country?: string; state?: string; city?: string },
  options: NominatimClientOptions,
): Promise<GeoBBox | null> {
  const parts = [params.city, params.state, params.country].filter(Boolean);
  if (parts.length === 0) return null;
  const q = parts.join(", ");

  const url = `${options.apiUrl.replace(
    /\/$/,
    "",
  )}/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const res = await withRetry(
      async () => {
        const r = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json",
          },
        });
        if (!r.ok) {
          const err = new Error(`Nominatim HTTP ${r.status}`);
          (err as unknown as { status?: number }).status = r.status;
          throw err;
        }
        return (await r.json()) as NominatimResult[];
      },
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        onRetry: (attempt, error) => {
          logger.warn("Nominatim retry", {
            q,
            attempt,
            error: (error as Error).message,
          });
        },
        shouldRetry: (error) => {
          const status = (error as unknown as { status?: number }).status;
          return status === undefined || status === 429 || status >= 500;
        },
      },
    );

    const item = Array.isArray(res) ? res[0] : null;
    if (!item?.boundingbox || item.boundingbox.length < 4) return null;
    const [south, north, west, east] = item.boundingbox.map(Number);
    if (![south, north, west, east].every(Number.isFinite)) return null;
    return { south, west, north, east };
  } catch (error) {
    logger.warn("Falha no geocoding Nominatim", {
      q,
      error: (error as Error).message,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
