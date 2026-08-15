/**
 * Erro de API com código e status HTTP.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Não autorizado'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Acesso negado'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Não encontrado'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static tooManyRequests(message = 'Muitas requisições'): ApiError {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
}

/** Wrap de handler async do Express. */
export function asyncHandler(
  fn: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>
): import('express').RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

/** Resposta de sucesso padronizada. */
export function ok<T>(res: import('express').Response, data: T, status = 200): import('express').Response {
  return res.status(status).json({ success: true, data });
}
