import { NextFunction, Request, Response } from 'express';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Rejeita identificadores malformados antes de qualquer consulta ao banco. */
export function validateUuidParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.params[paramName];
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      return res.status(400).json({ error: 'Identificador inválido.', code: 'INVALID_ID' });
    }
    return next();
  };
}

/** Cabeçalhos defensivos para respostas da API, sem expor detalhes da plataforma. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}
