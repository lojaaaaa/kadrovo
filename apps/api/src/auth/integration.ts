import { RatingService } from '../rooms/rating.service';
import { config } from 'dotenv';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { CatalogStore } from '../content/store';
import { OAuthService } from './oauth.service';
import { AuthService } from './auth.service';
import { digest, hashPassword, opaque, verifyPassword } from './security';
config({ path: '../../.env', quiet: true });
async function main() {
  const url =
    process.env.DATABASE_URL ??
    'postgresql://filmless:filmless_local@localhost:5432/filmless';
  const schema = `filmless_auth_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: url });
  const store = new CatalogStore({ url, schema }),
    auth = new AuthService(store);
  let created = false;
  try {
    const connection = await pool.connect();
    try {
      await connection.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      await connection.query(`SET search_path TO "${schema}"`);
      await connection.query(
        await readFile(
          'prisma/migrations/20261022090000_accounts/migration.sql',
          'utf8',
        ),
      );
      await connection.query(
        await readFile(
          'prisma/migrations/20261022090100_session_version/migration.sql',
          'utf8',
        ),
      );
      await connection.query(
        await readFile(
          'prisma/migrations/202610230003_ratings/migration.sql',
          'utf8',
        ),
      );
      await connection.query(
        await readFile(
          'prisma/migrations/202610230004_avatars/migration.sql',
          'utf8',
        ),
      );
    } finally {
      connection.release();
    }
    const account = await store.db.account.create({
      data: {
        nickname: 'Тест',
        email: 'account@example.invalid',
        passwordHash: await hashPassword('old test password'),
      },
    });
    const { default: sharp } = await import('sharp');
    const image = await sharp({
      create: { width: 60, height: 90, channels: 3, background: '#bb8855' },
    })
      .png()
      .toBuffer();
    const withAvatar = await auth.updateAvatar(
      account.id,
      'data:image/png;base64,' + image.toString('base64'),
    );
    assert.match(
      withAvatar.avatarUrl!,
      new RegExp('^/api/auth/avatar/' + account.id),
    );
    const savedAvatar = await auth.avatar(account.id);
    assert.equal(
      (await sharp(Buffer.from(savedAvatar!)).metadata()).width,
      256,
    );
    await assert.rejects(
      auth.updateAvatar(account.id, 'data:image/png;base64,broken'),
    );
    assert.equal(
      (await auth.updateProfile(account.id, 'Новый ник')).avatarUrl,
      withAvatar.avatarUrl,
    );
    assert.equal((await auth.updateAvatar(account.id, null)).avatarUrl, null);
    assert.equal(await auth.avatar(account.id), null);
    const rival = await store.db.account.create({
      data: { nickname: 'Соперник' },
    });
    const ratings = new RatingService(store);
    const result = {
      matchId: randomUUID(),
      firstId: account.id,
      secondId: rival.id,
      firstScore: 40,
      secondScore: 20,
    };
    await Promise.all([ratings.record(result), ratings.record(result)]);
    let table = await ratings.table(account.id);
    assert.equal(table.me?.rating, 1016);
    assert.equal(table.me?.battleGames, 1);
    assert.equal(table.me?.battleWins, 1);
    assert.equal(table.place, 1);
    assert.equal(table.players[1]?.rating, 984);
    await ratings.record({
      ...result,
      matchId: randomUUID(),
      firstScore: 0,
      secondScore: 0,
    });
    table = await ratings.table(account.id);
    assert.equal(table.me?.battleGames, 2);
    assert.equal(
      table.players.reduce((sum, p) => sum + p.rating, 0),
      2000,
    );
    await assert.rejects(
      ratings.record({
        ...result,
        matchId: randomUUID(),
        secondId: randomUUID(),
      }),
    );
    assert.equal((await ratings.table(account.id)).me?.battleGames, 2);
    await assert.rejects(
      auth.login(account.email!, 'old test password'),
      /Подтвердите/,
    );
    const verify = opaque();
    await store.db.authChallenge.create({
      data: {
        tokenHash: digest(verify),
        kind: 'verify',
        accountId: account.id,
        verifier: await hashPassword('chosen test password'),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const simultaneous = await Promise.allSettled([
      auth.consume(verify, 'verify'),
      auth.consume(verify, 'verify'),
    ]);
    assert.equal(
      simultaneous.filter((r) => r.status === 'fulfilled').length,
      1,
    );
    await assert.rejects(
      auth.login(account.email!, 'old test password'),
      /Неверная/,
    );
    const login = await auth.login(account.email!, 'chosen test password');
    assert.equal((await auth.session(login.token))?.id, account.id);
    assert.equal(await auth.session(opaque()), null);
    assert.equal(
      await store.db.authSession.count({ where: { tokenHash: login.token } }),
      0,
    );
    const expired = opaque();
    await store.db.authChallenge.create({
      data: {
        tokenHash: digest(expired),
        kind: 'reset',
        accountId: account.id,
        expiresAt: new Date(Date.now() - 1),
      },
    });
    await assert.rejects(
      auth.consume(expired, 'reset', 'new test password'),
      /устарела/,
    );
    const reset = opaque();
    await store.db.authChallenge.create({
      data: {
        tokenHash: digest(reset),
        kind: 'reset',
        accountId: account.id,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await assert.rejects(auth.consume(reset, 'verify'), /устарела/);
    await auth.consume(reset, 'reset', 'new test password');
    assert.equal(await auth.session(login.token), null);
    const racedLogin = await auth.issue(account.id, 0);
    assert.equal(await auth.session(racedLogin), null);
    await assert.rejects(
      auth.consume(reset, 'reset', 'stolen password'),
      /устарела/,
    );
    const updated = await store.db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    assert(await verifyPassword('new test password', updated.passwordHash!));
    const next = await auth.login(account.email!, 'new test password');
    await auth.logout(next.token);
    assert.equal(await auth.session(next.token), null);
    // Mock only provider HTTP, keeping real one-use state and account persistence.
    const originalFetch = globalThis.fetch;
    const savedTwitchId = process.env.TWITCH_CLIENT_ID,
      savedTwitchSecret = process.env.TWITCH_CLIENT_SECRET;
    const savedId = process.env.YANDEX_CLIENT_ID,
      savedSecret = process.env.YANDEX_CLIENT_SECRET;
    process.env.YANDEX_CLIENT_ID = 'integration-client';
    process.env.YANDEX_CLIENT_SECRET = 'integration-secret';
    try {
      const oauth = new OAuthService(store, auth);
      const flow = await oauth.start('yandex');
      const authorization = new URL(flow.url);
      assert.equal(
        authorization.searchParams.get('code_challenge_method'),
        'S256',
      );
      await assert.rejects(
        oauth.finish('yandex', flow.state, opaque(), 'code'),
      );
      globalThis.fetch = async (url, options) => {
        if (String(url) === 'https://oauth.yandex.ru/token') {
          assert((options?.body as URLSearchParams).get('code_verifier'));
          return Response.json({ access_token: 'integration-access-token' });
        }
        assert.equal(String(url), 'https://login.yandex.ru/info?format=json');
        return Response.json({
          id: 'integration-subject',
          client_id: 'integration-client',
          login: 'tester',
          display_name: 'OAuth Тест',
        });
      };
      const oauthToken = await oauth.finish(
        'yandex',
        flow.state,
        flow.state,
        'code',
      );
      assert.equal((await auth.session(oauthToken))?.nickname, 'OAuth Тест');
      await assert.rejects(
        oauth.finish('yandex', flow.state, flow.state, 'code'),
      );
      const secondFlow = await oauth.start('yandex');
      const secondToken = await oauth.finish(
        'yandex',
        secondFlow.state,
        secondFlow.state,
        'code',
      );
      assert.equal(
        (await auth.session(secondToken))?.id,
        (await auth.session(oauthToken))?.id,
      );
      assert.equal(await store.db.identity.count(), 1);
      process.env.TWITCH_CLIENT_ID = 'integration-twitch';
      process.env.TWITCH_CLIENT_SECRET = 'integration-twitch-secret';
      globalThis.fetch = async (url) => {
        if (String(url) === 'https://id.twitch.tv/oauth2/token')
          return Response.json({ access_token: 'integration-twitch-token' });
        if (String(url) === 'https://id.twitch.tv/oauth2/validate')
          return Response.json({
            client_id: 'integration-twitch',
            user_id: 'integration-subject',
          });
        assert.equal(String(url), 'https://api.twitch.tv/helix/users');
        return Response.json({
          data: [{ id: 'integration-subject', display_name: 'Twitch Тест' }],
        });
      };
      const twitchFlow = await oauth.start('twitch');
      const twitchToken = await oauth.finish(
        'twitch',
        twitchFlow.state,
        twitchFlow.state,
        'code',
      );
      assert.equal((await auth.session(twitchToken))?.nickname, 'Twitch Тест');
      assert.notEqual(
        (await auth.session(twitchToken))?.id,
        (await auth.session(oauthToken))?.id,
      );
      assert.equal(await store.db.identity.count(), 2);
      await assert.rejects(
        oauth.finish('twitch', twitchFlow.state, twitchFlow.state, 'code'),
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTwitchId === undefined) delete process.env.TWITCH_CLIENT_ID;
      else process.env.TWITCH_CLIENT_ID = savedTwitchId;
      if (savedTwitchSecret === undefined)
        delete process.env.TWITCH_CLIENT_SECRET;
      else process.env.TWITCH_CLIENT_SECRET = savedTwitchSecret;
      if (savedId === undefined) delete process.env.YANDEX_CLIENT_ID;
      else process.env.YANDEX_CLIENT_ID = savedId;
      if (savedSecret === undefined) delete process.env.YANDEX_CLIENT_SECRET;
      else process.env.YANDEX_CLIENT_SECRET = savedSecret;
    }
    console.log(
      'Auth integration passed: avatar normalization/persistence/removal, rating transactions, verification race, password binding, reset expiry/replay, session revocation, logout, OAuth state/PKCE/identity (mock provider).',
    );
  } finally {
    auth.onModuleDestroy();
    await store.onModuleDestroy();
    if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    'Auth integration failed:',
    error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[database]')
      : 'Unknown error',
  );
  process.exitCode = 1;
});
