import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ForbiddenException, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
const derive = promisify(scrypt);
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hex] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !hex || !/^[a-f0-9]{128}$/.test(hex))
    return false;
  const actual = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
export const webOrigin = () =>
  new URL(process.env.WEB_ORIGIN ?? 'http://localhost:3000').origin;
export function sameOrigin(req: Request) {
  if (req.headers.origin !== webOrigin())
    throw new ForbiddenException('Недопустимый источник запроса.');
}
export function cookie(req: Request, name: string) {
  return (
    req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  );
}
export function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAge: number,
) {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: webOrigin().startsWith('https:'),
    path: '/',
    maxAge,
  });
}
export class RateLimit {
  private entries = new Map<string, { until: number; count: number }>();
  take(key: string, limit = 10, windowMs = 15 * 60_000) {
    const now = Date.now();
    for (const [k, v] of this.entries)
      if (v.until <= now) this.entries.delete(k);
    const entry = this.entries.get(key) ?? { until: now + windowMs, count: 0 };
    if (this.entries.size >= 10000 && !this.entries.has(key))
      throw new HttpException('Попробуйте позже.', 429);
    if (++entry.count > limit)
      throw new HttpException('Слишком много попыток. Попробуйте позже.', 429);
    this.entries.set(key, entry);
  }
}
