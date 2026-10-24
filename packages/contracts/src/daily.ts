/** Daily challenges follow the Moscow calendar, independently of a player's device zone. */
export function dailyWindow(now = Date.now()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
  return { day, nextAt: Date.parse(day + 'T21:00:00Z'), serverTime: now };
}
export function isArchiveDay(day: string, now = Date.now()) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day + 'T12:00:00Z')) &&
    new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day &&
    day < dailyWindow(now).day
  );
}
