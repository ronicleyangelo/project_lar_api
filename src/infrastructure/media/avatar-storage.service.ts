import { Request } from 'express';

const MAX_AVATAR_BYTES = 500 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_GOOGLE_HOSTS = ['googleusercontent.com', 'ggpht.com'];

export interface DownloadedAvatar {
  data: Buffer;
  mimeType: string;
}

export class AvatarStorageService {
  static async downloadGoogleAvatar(source: string | undefined): Promise<DownloadedAvatar | null> {
    if (!source) return null;

    try {
      const url = new URL(source);
      const allowedHost = ALLOWED_GOOGLE_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
      if (url.protocol !== 'https:' || !allowedHost) return null;

      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
      });
      if (!response.ok) return null;

      const mimeType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (!ALLOWED_MIME_TYPES.has(mimeType) || declaredSize > MAX_AVATAR_BYTES) return null;

      const data = Buffer.from(await response.arrayBuffer());
      if (!data.length || data.length > MAX_AVATAR_BYTES) return null;
      return { data, mimeType };
    } catch {
      return null;
    }
  }

  static publicUrl(req: Request, user: { id: string; avatarUrl?: string | null; storedAvatar?: { updatedAt: Date } | null }): string | null {
    if (!user.storedAvatar) return user.avatarUrl || null;
    const version = user.storedAvatar.updatedAt.getTime();
    return `${req.protocol}://${req.get('host')}/api/avatars/${user.id}?v=${version}`;
  }
}
