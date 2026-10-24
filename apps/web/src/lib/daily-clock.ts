/** Use server time plus elapsed request age, so a wrong device clock cannot change the daily date. */
export function dailyCountdown(
  nextAt: number,
  serverTime: number,
  receivedAt: number,
  now: number,
) {
  const remaining = Math.max(
    0,
    nextAt - serverTime - Math.max(0, now - receivedAt),
  );
  const minutes = Math.ceil(remaining / 60000);
  return {
    expired: remaining === 0,
    text: `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`,
  };
}
