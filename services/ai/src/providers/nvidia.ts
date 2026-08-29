import { config } from '@prospector/config';
import { OpenAICompatibleProvider } from './provider';

/** Provedor NVIDIA NIM — primário (modelo moonshotai/kimi-k3). */
export class NvidiaProvider extends OpenAICompatibleProvider {
  readonly name = 'nvidia' as const;
  protected readonly baseUrl = config.ai.nvidiaBaseUrl;
  protected readonly model = config.ai.nvidiaModel;
  protected readonly apiKey = config.ai.nvidiaApiKey || undefined;
}