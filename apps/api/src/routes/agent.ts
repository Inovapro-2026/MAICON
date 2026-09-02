import { Router, Request, Response } from 'express';
import multer from 'multer';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok, ApiError } from '../lib/http';
import { requireAuth, requireBusiness } from '../middleware/auth';
import { transcribeAudio, processChat, textToSpeech } from '../services/agent-service';

const logger = createLogger('api.agent');

export const agentRouter = Router();

agentRouter.use(requireAuth, requireBusiness);

// Upload de áudio em memória (microfone do navegador)
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

/** POST /agent/transcribe — STT (Groq Whisper). Envia arquivo de áudio. */
agentRouter.post(
  '/transcribe',
  uploadAudio.single('audio'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Envie o arquivo de áudio (campo "audio")' } });
    }
    const mimeType = req.file.mimetype || 'audio/webm';
    const text = await transcribeAudio(req.file.buffer, mimeType);
    if (!text) {
      return ok(res, { text: '' });
    }
    logger.info('Áudio transcrito', { business_id: req.user!.businessId, chars: text.length });
    return ok(res, { text });
  })
);

/** POST /agent/chat — LLM com function calling + execução de ferramentas. */
agentRouter.post(
  '/chat',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const userId = req.user!.sub;

    const transcript = String(req.body?.transcript ?? '').trim().slice(0, 1000);
    if (!transcript) throw ApiError.badRequest('Informe o texto falado (transcript)');

    // Histórico (máx 30 turnos) — mais antigo → mais novo, sempre fecha em "user"
    const raw = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = raw
      .slice(0, 30)
      .map((m: { role?: string; content?: string }) => ({
        role: m?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(m?.content ?? '').slice(0, 2000),
      }))
      .filter((m: { content: string }) => m.content.trim());

    const result = await processChat(businessId, userId, transcript, history);
    return ok(res, result);
  })
);

/** POST /agent/tts — TTS (ElevenLabs). Retorna o áudio MP3 ou fallback. */
agentRouter.post(
  '/tts',
  asyncHandler(async (req: Request, res: Response) => {
    const text = String(req.body?.text ?? '').trim().slice(0, 1000);
    if (!text) throw ApiError.badRequest('Informe o texto a ser falado');

    const result = await textToSpeech(text);
    if (result.fallbackToBrowser) {
      // Falhou (quota/erro) — frontend deve usar voz nativa do navegador
      return res.status(200).json({
        success: true,
        data: { fallback: true, reason: result.fallbackReason ?? 'error' },
      });
    }

    if (!result.audio) {
      return res.status(200).json({
        success: true,
        data: { fallback: true, reason: 'error' },
      });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(result.audio.length));
    res.setHeader('Cache-Control', 'no-store');
    return res.send(result.audio);
  })
);

/** GET /agent/status — indica se as APIs de voz estão configuradas. */
agentRouter.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    const { config } = await import('@prospector/config');
    return ok(res, {
      stt: Boolean(config.ai.groqApiKey),
      tts: Boolean(config.ai.elevenlabsApiKey),
      voiceId: config.ai.agentVoiceId,
    });
  })
);