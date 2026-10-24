/** Retain every loaded hint in the active round; discard previous rounds together. */
export function rememberRoundImage<T extends { round: string }>(
  previous: Map<string, T>,
  key: string,
  shot: T,
) {
  const next = new Map(
    [...previous].filter(([, value]) => value.round === shot.round),
  );
  next.set(key, shot);
  return next;
}
