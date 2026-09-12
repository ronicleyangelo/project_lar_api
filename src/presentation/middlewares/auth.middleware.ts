import { Request, Response, NextFunction } from 'express';
import { JwtProvider, TokenPayload } from '../../infrastructure/security/jwt.provider';
import { prisma } from '../../infrastructure/database/prisma.service';
import { COOKIE_NAME } from '../../shared/http/cookie.helper';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Dual-mode: prioriza cookie HttpOnly, fallback estrito para Bearer.
  const authorization = req.headers.authorization;
  const bearerMatch = authorization?.match(/^Bearer ([^\s]+)$/i);
  const token = req.cookies?.[COOKIE_NAME] || bearerMatch?.[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso não fornecido.' });
  }

  try {
    const claims = JwtProvider.verifyToken(token);
    const account = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!account) return res.status(401).json({ error: 'Conta não encontrada.' });
    if (account.status === 'SUSPENDED') return res.status(403).json({ error: 'Esta conta está suspensa.' });
    if (account.status === 'DELETION_PENDING' && !req.originalUrl.startsWith('/api/account')) {
      return res.status(403).json({ error: 'Esta conta possui exclusão agendada. Acesse Minha conta para cancelar.' });
    }
    // Permissões vêm sempre do banco. Isso invalida imediatamente papéis antigos
    // presentes em tokens ainda não expirados.
    req.user = { userId: account.id, email: account.email, role: account.role };
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
