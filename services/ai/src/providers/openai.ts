import { config } from "@prospector/config";
import { OpenAICompatibleProvider } from "./provider";

/** Provedor OpenAI — provedor primário. */
export class OpenAIProvider extends OpenAICompatibleProvider {
  readonly name = "openai" as const;
  protected readonly baseUrl = "https://api.openai.com/v1";
  protected readonly model = config.ai.openaiModel;
  protected readonly apiKey = config.ai.openaiApiKey || undefined;
}
