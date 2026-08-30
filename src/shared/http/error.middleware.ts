import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';

export function errorMiddleware(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(error);
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
