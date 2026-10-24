'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};
const read = () => {
  try {
    return localStorage.getItem('kadrovo:active-room') ?? '';
  } catch {
    return '';
  }
};
export function ResumeGame() {
  const code = useSyncExternalStore(subscribe, read, () => '');
  if (!/^[A-F0-9]{8}$/.test(code)) return null;
  return (
    <Link
      href={'/room/' + code}
      className="mb-5 flex justify-between rounded-xl border bg-card p-4 text-sm"
    >
      <span>Продолжить игру</span>
      <span className="text-primary">Вернуться →</span>
    </Link>
  );
}
