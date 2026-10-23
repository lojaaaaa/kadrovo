import { api } from './account';
import type { RoomSession } from '@filmless/contracts';
export const sessionKey = (code: string) => `filmless:room:${code}`;
export async function roomRequest(
  path: string,
  body: unknown,
): Promise<RoomSession> {
  return api<RoomSession>(`rooms${path}`, 'POST', body);
}
export function saveSession(session: RoomSession) {
  localStorage.setItem(sessionKey(session.code), JSON.stringify(session));
}
