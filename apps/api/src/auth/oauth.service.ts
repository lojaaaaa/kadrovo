import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CatalogStore } from '../content/store';
import { AuthService } from './auth.service';
import { digest, opaque, webOrigin } from './security';
export const providerSchema = z.enum(['yandex', 'twitch']);
type Provider = z.infer<typeof providerSchema>;
const config = (provider: Provider) => ({
  id: process.env[`${provider.toUpperCase()}_CLIENT_ID`] ?? '',
  secret: process.env[`${provider.toUpperCase()}_CLIENT_SECRET`] ?? '',
  callback: `${webOrigin()}/api/auth/oauth/${provider}/callback`,
  authorize:
    provider === 'yandex'
      ? 'https://oauth.yandex.ru/authorize'
      : 'https://id.twitch.tv/oauth2/authorize',
  token:
    provider === 'yandex'
      ? 'https://oauth.yandex.ru/token'
      : 'https://id.twitch.tv/oauth2/token',
});
async function json(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('OAuth request failed');
  return response.json() as Promise<unknown>;
}
@Injectable()
export class OAuthService {
  constructor(
    @Inject(CatalogStore) private readonly store: CatalogStore,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async start(provider: Provider) {
    const c = config(provider);
    if (!c.id || !c.secret)
      throw new ServiceUnavailableException(
        'Этот способ входа ещё не настроен.',
      );
    const state = opaque(),
      verifier = opaque();
    await this.store.db.authChallenge.create({
      data: {
        tokenHash: digest(state),
        kind: `oauth:${provider}`,
        verifier,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const url = new URL(c.authorize);
    url.search = new URLSearchParams({
      client_id: c.id,
      redirect_uri: c.callback,
      response_type: 'code',
      state,
    }).toString();
    if (provider === 'yandex') {
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set(
        'code_challenge',
        createHash('sha256').update(verifier).digest('base64url'),
      );
    } else url.searchParams.set('scope', '');
    return { state, url: url.toString() };
  }
  async finish(
    provider: Provider,
    state: string,
    browserState: string,
    code: string,
  ) {
    if (
      !/^[a-f0-9]{64}$/.test(state) ||
      state !== browserState ||
      !code ||
      code.length > 2048
    )
      throw new BadRequestException('Недействительная попытка входа.');
    const challenge = await this.store.db.authChallenge.findUnique({
      where: { tokenHash: digest(state) },
    });
    if (
      !challenge ||
      challenge.kind !== `oauth:${provider}` ||
      challenge.expiresAt <= new Date()
    )
      throw new BadRequestException('Попытка входа устарела.');
    const consumed = await this.store.db.authChallenge.deleteMany({
      where: { tokenHash: challenge.tokenHash },
    });
    if (!consumed.count)
      throw new BadRequestException('Попытка входа уже использована.');
    const c = config(provider);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: c.id,
      client_secret: c.secret,
      code,
      redirect_uri: c.callback,
    });
    if (provider === 'yandex') body.set('code_verifier', challenge.verifier!);
    const tokens = z
      .object({ access_token: z.string().min(1) })
      .parse(await json(c.token, { method: 'POST', body }));
    let subject: string, nickname: string;
    if (provider === 'yandex') {
      const profile = z
        .object({
          id: z.string().min(1),
          client_id: z.string(),
          display_name: z.string().optional(),
          login: z.string(),
        })
        .parse(
          await json('https://login.yandex.ru/info?format=json', {
            headers: { Authorization: `OAuth ${tokens.access_token}` },
          }),
        );
      if (profile.client_id !== c.id) throw new Error('Invalid OAuth client');
      subject = profile.id;
      nickname = profile.display_name || profile.login;
    } else {
      const validation = z
        .object({ client_id: z.string(), user_id: z.string() })
        .parse(
          await json('https://id.twitch.tv/oauth2/validate', {
            headers: { Authorization: `OAuth ${tokens.access_token}` },
          }),
        );
      if (validation.client_id !== c.id)
        throw new Error('Invalid OAuth client');
      const profile = z
        .object({
          data: z
            .array(z.object({ id: z.string(), display_name: z.string() }))
            .length(1),
        })
        .parse(
          await json('https://api.twitch.tv/helix/users', {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              'Client-Id': c.id,
            },
          }),
        );
      subject = profile.data[0]!.id;
      if (subject !== validation.user_id)
        throw new Error('Invalid OAuth subject');
      nickname = profile.data[0]!.display_name;
    }
    // Identity is provider + subject. Email never silently links unrelated accounts.
    const identity = await this.store.db.identity.upsert({
      where: { provider_subject: { provider, subject } },
      update: {},
      create: {
        provider,
        subject,
        account: { create: { nickname: nickname.slice(0, 24) || 'Игрок' } },
      },
    });
    return this.auth.issue(identity.accountId);
  }
}
