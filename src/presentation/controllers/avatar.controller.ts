import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';

export class AvatarController {
  static async get(req: Request, res: Response) {
    const avatar = await prisma.userAvatar.findUnique({ where: { userId: req.params.userId } });
    if (!avatar) return res.status(404).end();

    res.setHeader('Content-Type', avatar.mimeType);
    res.setHeader('Content-Length', String(avatar.data.length));
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Last-Modified', avatar.updatedAt.toUTCString());
    return res.send(avatar.data);
  }
}
