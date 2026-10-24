'use client';
import { ExperiencePanel } from './experience-panel';
import { SectionSkeleton } from './section-skeleton';
import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AccountState } from '@/lib/account';
import {
  getSoundSettings,
  getServerSoundSettings,
  subscribeSound,
  setSoundSettings,
} from '@/lib/sound';
import { Avatar } from './avatar';
import { Switch } from 'radix-ui';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
export function Profile() {
  const client = useQueryClient();
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  const [nickname, setNickname] = useState<string | null>(null);
  const sound = useSyncExternalStore(
    subscribeSound,
    getSoundSettings,
    getServerSoundSettings,
  );
  const save = useMutation({
    mutationFn: () =>
      api('auth/profile', 'POST', {
        nickname: nickname ?? account.data?.account?.nickname,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['account'] });
    },
  });
  const [avatarError, setAvatarError] = useState('');
  const avatar = useMutation({
    mutationFn: (image: string | null) => api('auth/avatar', 'POST', { image }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['account'] });
      void client.invalidateQueries({ queryKey: ['ratings'] });
    },
  });
  async function upload(file?: File) {
    if (!file) return;
    setAvatarError('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 10000000
    ) {
      setAvatarError('Выберите JPEG, PNG или WebP до 10 МБ.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) throw new Error();
      const side = Math.min(bitmap.width, bitmap.height);
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      bitmap.close();
      await avatar.mutateAsync(canvas.toDataURL('image/jpeg', 0.8));
    } catch {
      setAvatarError(
        'Не удалось загрузить аватарку. Попробуйте другое изображение.',
      );
    }
  }
  const logout = useMutation({
    mutationFn: () => api('auth/logout', 'POST'),
    onSuccess: () => {
      void client.resetQueries({ queryKey: ['account'] });
      void client.resetQueries({ queryKey: ['experience'] });
      void client.resetQueries({ queryKey: ['daily-archive'] });
    },
  });
  return (
    <main className="screen screen--profile mx-auto max-w-5xl px-5 py-6">
      <h1 className="mt-4 text-4xl font-black">Профиль и настройки</h1>
      {account.isPending ? (
        <SectionSkeleton kind="profile" />
      ) : !account.data?.account ? (
        <Link href="/account" className="mt-4 block text-primary">
          Войти в аккаунт →
        </Link>
      ) : (
        <div className="profile-panels mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border surface-panel bg-card p-5">
            <div className="flex flex-wrap items-center gap-5">
              <Avatar
                src={account.data.account.avatarUrl}
                name={account.data.account.nickname}
                className="size-20 text-3xl"
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-bold">
                  {account.data.account.nickname}
                </h2>
                <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 py-2 text-sm hover:border-primary focus-within:ring-2 focus-within:ring-primary">
                  {avatar.isPending ? 'Загружаем…' : 'Добавить аватарку'}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={avatar.isPending}
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {account.data.account.avatarUrl && (
                  <Button
                    variant="ghost"
                    disabled={avatar.isPending}
                    onClick={() => avatar.mutate(null)}
                  >
                    Удалить
                  </Button>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  JPEG, PNG, WebP · до 10 МБ · обрежем по центру
                </p>
              </div>
            </div>
            {(avatarError || avatar.error) && (
              <p role="alert" className="mt-3 text-destructive">
                {avatarError || avatar.error?.message}
              </p>
            )}
            <form
              className="mt-6 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <Label htmlFor="profile-nickname">Ник в игре</Label>
              <Input
                id="profile-nickname"
                required
                maxLength={24}
                value={nickname ?? account.data.account.nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  save.reset();
                }}
              />
              <p className="text-xs text-muted-foreground">
                Новый ник появится в следующих играх.
              </p>
              <Button disabled={save.isPending}>
                {save.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              {save.isSuccess && (
                <p role="status" className="text-primary">
                  Профиль сохранён
                </p>
              )}
            </form>
          </section>
          <section className="space-y-4 rounded-2xl border surface-panel bg-card p-5">
            <h2 className="text-xl font-bold">Звук в игре</h2>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="sound-enabled">Звуковые эффекты</Label>
              <Switch.Root
                id="sound-enabled"
                checked={sound.enabled}
                onCheckedChange={(enabled) =>
                  setSoundSettings({ ...sound, enabled })
                }
                className="h-7 w-12 shrink-0 rounded-full border bg-secondary p-0.5 transition data-[state=checked]:bg-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <Switch.Thumb className="block size-5 rounded-full bg-foreground shadow transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-primary-foreground" />
              </Switch.Root>
            </div>
            <Label htmlFor="profile-volume">
              Громкость · {Math.round(sound.volume * 100)}%
            </Label>
            <input
              id="profile-volume"
              type="range"
              className="block w-full accent-primary"
              min="0"
              max="100"
              value={Math.round(sound.volume * 100)}
              onChange={(e) =>
                setSoundSettings({
                  ...sound,
                  volume: Number(e.target.value) / 100,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Настройки звука сохраняются в этом браузере.
            </p>
          </section>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border surface-panel bg-card p-5">
            <Link href="/account" className="text-primary">
              Способы входа и восстановление пароля →
            </Link>
            <Button
              variant="outline"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              Выйти
            </Button>
          </section>
        </div>
      )}
      <ExperiencePanel />
      {(account.error || save.error || logout.error) && (
        <p role="alert" className="mt-5 text-destructive">
          {account.error?.message ||
            save.error?.message ||
            logout.error?.message}
        </p>
      )}
    </main>
  );
}
