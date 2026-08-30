import { Request, Response, NextFunction } from 'express';
import { JwtProvider, TokenPayload } from '../../infrastructure/security/jwt.provider';
import { prisma } from '../../infrastructure/database/prisma.service';
import { COOKIE_NAME } from '../../shared/http/cookie.helper';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Dual-mode: prioriza cookie HttpOnly, fallback para header Authorization (transição)
  const token = req.cookies?.[COOKIE_NAME]
              || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso não fornecido.' });
  }

  try {
    req.user = JwtProvider.verifyToken(token);
    const account = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { status: true } });
    if (!account) return res.status(401).json({ error: 'Conta não encontrada.' });
    if (account.status === 'SUSPENDED') return res.status(403).json({ error: 'Esta conta está suspensa.' });
    if (account.status === 'DELETION_PENDING' && !req.originalUrl.startsWith('/api/account')) {
      return res.status(403).json({ error: 'Esta conta possui exclusão agendada. Acesse Minha conta para cancelar.' });
    }
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

export function authorizeRoles(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado. Permissão insuficiente.' });
    }
    return next();
  };
}
