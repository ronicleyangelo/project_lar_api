import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';

export function errorMiddleware(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(error);
  const httpError = error as { type?: string; status?: number };
  if (httpError.type === 'entity.too.large' || httpError.status === 413) {
    return res.status(413).json({ error: 'Corpo da requisição muito grande.', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (httpError.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido.', code: 'INVALID_JSON' });
  }
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Dados inválidos.',
      code: 'VALIDATION_ERROR',
      fields: error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  console.error('Unhandled request error', { method: req.method, path: req.path, error });
  return res.status(500).json({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' });
}
