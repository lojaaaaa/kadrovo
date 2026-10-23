export function parseRoomCode(input: string): string | null {
  const text = input.trim();
  if (/^[a-f0-9]{8}$/i.test(text)) return text.toUpperCase();
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const match = /^\/room\/([a-f0-9]{8})\/?$/i.exec(url.pathname);
    return match?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}
