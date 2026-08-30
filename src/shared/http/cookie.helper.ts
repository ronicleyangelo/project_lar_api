import { Response } from 'express';

export const COOKIE_NAME = 'access_token';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
  domain?: string;
}

function getCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const domain = process.env.COOKIE_DOMAIN || undefined;

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'none',
    path: '/api',
    maxAge: SEVEN_DAYS_MS,
    ...(domain ? { domain } : {}),
  };
}

export function setTokenCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, getCookieOptions());
}

export function clearTokenCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    path: '/api',
  });
}
