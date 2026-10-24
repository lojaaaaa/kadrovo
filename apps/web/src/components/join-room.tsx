'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { parseRoomCode } from '@/lib/room-code';
export function JoinRoomForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  return (
    <form
      className="rounded-2xl border border-border/70 surface-panel bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const code = parseRoomCode(value);
        if (!code) {
          setError(true);
          return;
        }
        router.push(`/room/${code}`);
      }}
    >
      <Label htmlFor="join-code">Друзья уже играют?</Label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <Input
          id="join-code"
          placeholder="Код комнаты или ссылка"
          maxLength={300}
          autoComplete="off"
          value={value}
          aria-invalid={error}
          aria-describedby={error ? 'join-error' : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
        />
        <Button type="submit" variant="outline" disabled={!value.trim()}>
          <LogIn />
          Войти по коду
        </Button>
      </div>
      {error && (
        <p
          id="join-error"
          role="alert"
          className="mt-2 text-sm text-destructive"
        >
          Введите 8 символов кода комнаты или ссылку-приглашение.
        </p>
      )}
    </form>
  );
}
