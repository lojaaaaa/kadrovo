export type AccountState = {
  account: { id: string; nickname: string; avatarUrl?: string | null } | null;
  providers: { yandex: boolean; twitch: boolean };
};
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    signal: AbortSignal.timeout(15000),
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  }).catch(() => {
    throw new Error('Нет связи с сервером. Попробуйте ещё раз.');
  });
  const data = await response.json().catch(() => null);
  if (!data) throw new Error('Сервис временно недоступен. Попробуйте ещё раз.');
  if (!response.ok) {
    if (
      typeof window !== 'undefined' &&
      (data.code === 'GUEST_LIMIT' || data.code === 'ACCOUNT_REQUIRED')
    )
      window.dispatchEvent(
        new CustomEvent('kadrovo:access-required', {
          detail: { url: data.loginUrl },
        }),
      );
    throw new Error(
      typeof data.message === 'string'
        ? data.message
        : 'Не удалось выполнить запрос.',
    );
  }
  return data as T;
}
