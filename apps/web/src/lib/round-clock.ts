export function roundClock({
  phase,
  seconds,
  solved = false,
  skipped = false,
  wrong = false,
}: {
  phase: 'playing' | 'reveal' | 'finished';
  seconds: number;
  solved?: boolean;
  skipped?: boolean;
  wrong?: boolean;
}) {
  if (phase !== 'playing')
    return { value: '—', label: 'Раунд завершён', urgent: false };
  if (wrong) return { value: '×', label: 'Неверно', urgent: false };
  if (skipped) return { value: '—', label: 'Пропущено', urgent: false };
  if (solved) return { value: '✓', label: 'Угадано', urgent: false };
  if (seconds <= 0) return { value: '—', label: 'Ждём игроков', urgent: false };
  return { value: String(seconds), label: 'с', urgent: seconds <= 5 };
}
