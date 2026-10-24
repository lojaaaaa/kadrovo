'use client';
import { registrationInput } from '@filmless/contracts';
import { useRouter } from 'next/navigation';
import { PasswordInput } from './password-input';
import { SectionSkeleton } from './section-skeleton';
import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AccountState } from '@/lib/account';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
const socialLoginVisible = false;
type Mode = 'login' | 'register' | 'forgot' | 'verify' | 'reset';
const titles: Record<Mode, string> = {
  login: 'Вход',
  register: 'Регистрация',
  forgot: 'Забыли пароль?',
  verify: 'Подтвердите почту',
  reset: 'Новый пароль',
};
function subscribeLocation(listener: () => void) {
  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('popstate', listener);
  };
}
export function AccountForm() {
  const router = useRouter();
  const [validation, setValidation] = useState<Record<string, string>>({});
  const [selectedMode, setMode] = useState<Mode>('login');
  const location = useSyncExternalStore(
    subscribeLocation,
    () => window.location.search + window.location.hash,
    () => '',
  );
  const hash = new URLSearchParams(location.split('#')[1] ?? '');
  const mode: Mode = hash.has('verify')
    ? 'verify'
    : hash.has('reset')
      ? 'reset'
      : selectedMode;
  const token = hash.get(mode) ?? '';
  const reason = new URLSearchParams(location.split('#')[0]).get('reason');
  const accessMessage =
    reason === 'guest-solo'
      ? 'Вы сыграли 5 гостевых соло-игр. Войдите или создайте аккаунт, чтобы продолжить.'
      : reason === 'guest-online'
        ? 'Вы сыграли 3 гостевые игры онлайн. Войдите или создайте аккаунт, чтобы продолжить.'
        : reason === 'ranked'
          ? 'Рейтинговые дуэли доступны после входа в аккаунт.'
          : reason === 'create-lobby'
            ? 'Для создания открытой комнаты нужен аккаунт. Закрытая комната доступна без регистрации.'
            : '';
  const oauthError = new URLSearchParams(location.split('#')[0]).has('error');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [nickname, setNickname] = useState('');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  const mutation = useMutation({
    mutationFn: () =>
      api<{ message?: string }>(
        `auth/${mode}`,
        'POST',
        mode === 'verify'
          ? { token }
          : mode === 'reset'
            ? { token, password }
            : mode === 'forgot'
              ? { email }
              : { email, password, nickname },
      ),
    onSuccess: async () => {
      setPassword('');
      await client.resetQueries({ queryKey: ['account'] });
      if (
        (mode === 'register' || mode === 'login') &&
        client.getQueryData<AccountState>(['account'])?.account
      )
        router.replace(
          reason === 'guest-solo'
            ? '/play/solo'
            : reason === 'ranked'
              ? '/battle'
              : reason === 'guest-online'
                ? '/online'
                : reason === 'create-lobby'
                  ? '/play/party'
                  : '/',
        );
      void client.resetQueries({ queryKey: ['experience'] });
      void client.resetQueries({ queryKey: ['daily-archive'] });
      void client.invalidateQueries({ queryKey: ['ratings'] });
    },
  });
  const logout = useMutation({
    mutationFn: () => api('auth/logout', 'POST'),
    onSuccess: () => {
      void client.resetQueries({ queryKey: ['account'] });
      void client.resetQueries({ queryKey: ['experience'] });
      void client.resetQueries({ queryKey: ['daily-archive'] });
      void client.invalidateQueries({ queryKey: ['ratings'] });
    },
  });
  function switchMode(next: Mode) {
    window.history.replaceState(null, '', '/account');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    setMode(next);
    setPassword('');
    mutation.reset();
    setValidation({});
  }
  if (query.isPending)
    return (
      <main className="screen screen--account-form mx-auto max-w-lg px-5 py-8">
        <SectionSkeleton kind="form" />
      </main>
    );
  return (
    <main className="screen screen--account-form mx-auto max-w-lg px-5 py-12">
      <Link href="/" className="text-xl font-bold">
        кадрово<span className="text-primary">.</span>
      </Link>
      <Card key={mode} className="mt-6 space-y-5 p-6">
        {query.data?.account && mode !== 'reset' && mode !== 'verify' ? (
          <>
            <h1 className="text-3xl font-bold">
              {query.data.account.nickname}
            </h1>
            <p className="text-muted-foreground">Вы вошли в аккаунт.</p>
            {reason && (
              <Link
                className="font-semibold text-primary"
                href={
                  reason === 'guest-solo'
                    ? '/play/solo'
                    : reason === 'create-lobby'
                      ? '/play/party'
                      : reason === 'ranked'
                        ? '/battle'
                        : '/online'
                }
              >
                Продолжить играть →
              </Link>
            )}
            <Link href="/profile" className="font-semibold text-primary">
              Открыть профиль →
            </Link>
            <Button
              variant="outline"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              Выйти из аккаунта
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold">{titles[mode]}</h1>
            <p className="text-sm text-muted-foreground">
              {accessMessage ||
                'Войдите, чтобы играть без гостевых ограничений и сохранять прогресс.'}
            </p>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setValidation({});
                if (mode === 'register') {
                  const checked = registrationInput.safeParse({
                    email,
                    password,
                    nickname,
                  });
                  if (!checked.success) {
                    setValidation(
                      Object.fromEntries(
                        checked.error.issues.map((issue) => [
                          String(issue.path[0]),
                          issue.message,
                        ]),
                      ),
                    );
                    return;
                  }
                }
                mutation.mutate();
              }}
            >
              {mode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="account-name">Ник в игре</Label>
                  <Input
                    id="account-name"
                    autoComplete="nickname"
                    required
                    minLength={2}
                    maxLength={24}
                    aria-invalid={!!validation.nickname}
                    aria-describedby={
                      validation.nickname ? 'nickname-error' : undefined
                    }
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                  />
                  {validation.nickname && (
                    <p
                      id="nickname-error"
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {validation.nickname}
                    </p>
                  )}
                </div>
              )}
              {['login', 'register', 'forgot'].includes(mode) && (
                <div className="space-y-2">
                  <Label htmlFor="account-email">Почта</Label>
                  <Input
                    id="account-email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    aria-invalid={!!validation.email}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {validation.email && (
                    <p role="alert" className="text-xs text-destructive">
                      {validation.email}
                    </p>
                  )}
                </div>
              )}
              {['login', 'register', 'reset'].includes(mode) && (
                <div className="space-y-2">
                  <Label htmlFor="account-password">
                    Пароль · от 10 символов
                  </Label>
                  <PasswordInput
                    id="account-password"
                    aria-invalid={!!validation.password}
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    required
                    minLength={10}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {validation.password && (
                    <p role="alert" className="text-xs text-destructive">
                      {validation.password}
                    </p>
                  )}
                </div>
              )}
              <Button
                className="w-full"
                disabled={
                  mutation.isPending ||
                  (mutation.isSuccess &&
                    (mode === 'verify' || mode === 'reset'))
                }
              >
                {mutation.isPending
                  ? 'Подождите…'
                  : {
                      login: 'Войти',
                      register: 'Зарегистрироваться',
                      forgot: 'Получить письмо',
                      verify: 'Подтвердить почту',
                      reset: 'Сохранить пароль',
                    }[mode]}
              </Button>
            </form>
            {mutation.data?.message && (
              <p role="status" className="text-sm text-primary">
                {mutation.data.message}
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              {mode !== 'login' && (
                <Button variant="ghost" onClick={() => switchMode('login')}>
                  Уже есть аккаунт? Войти
                </Button>
              )}
              {mode === 'login' && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => switchMode('register')}
                  >
                    Создать аккаунт
                  </Button>
                  <Button
                    className="hidden"
                    variant="ghost"
                    onClick={() => switchMode('forgot')}
                  >
                    Забыли пароль?
                  </Button>
                </>
              )}
            </div>
            {socialLoginVisible &&
              (mode === 'login' || mode === 'register') && (
                <div className="space-y-3 border-t pt-5">
                  <p className="text-sm text-muted-foreground">
                    Или войдите через сервис
                  </p>
                  <div className="flex gap-3">
                    {(['yandex', 'twitch'] as const).map((provider) =>
                      query.data?.providers[provider] ? (
                        <a
                          key={provider}
                          href={`/api/auth/oauth/${provider}`}
                          className="rounded-lg border px-4 py-2"
                        >
                          {provider === 'yandex' ? 'Яндекс' : 'Twitch'}
                        </a>
                      ) : (
                        <Button key={provider} variant="outline" disabled>
                          {provider === 'yandex' ? 'Яндекс' : 'Twitch'} · скоро
                        </Button>
                      ),
                    )}
                  </div>
                  {query.data &&
                    (!query.data?.providers.yandex ||
                      !query.data?.providers.twitch) && (
                      <p className="text-xs text-muted-foreground">
                        Недоступные способы входа ещё подключаются.
                      </p>
                    )}
                </div>
              )}
          </>
        )}
        {(mutation.error || logout.error || query.error || oauthError) && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error?.message ||
              logout.error?.message ||
              query.error?.message ||
              'Не удалось войти через сервис. Попробуйте ещё раз.'}
          </p>
        )}
      </Card>
    </main>
  );
}
