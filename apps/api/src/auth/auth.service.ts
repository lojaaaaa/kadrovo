import { randomUUID } from 'node:crypto';
import { avatarUrl, prepareAvatar } from './avatar';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import nodemailer from 'nodemailer';
import { CatalogStore } from '../content/store';
import {
  digest,
  hashPassword,
  opaque,
  verifyPassword,
  webOrigin,
} from './security';
const publicAccount = (a: {
  id: string;
  nickname: string;
  avatarVersion?: string | null;
}) => ({
  id: a.id,
  nickname: a.nickname,
  avatarUrl: avatarUrl(a),
});
const genericMail = {
  message:
    'Если адрес подходит, мы отправили письмо. Проверьте входящие и спам.',
};
@Injectable()
export class AuthService implements OnModuleDestroy {
  private cleanup: ReturnType<typeof setInterval>;
  constructor(@Inject(CatalogStore) private readonly store: CatalogStore) {
    this.cleanup = setInterval(() => {
      void this.expire().catch(() => {});
    }, 600_000);
    this.cleanup.unref();
  }
  onModuleDestroy() {
    clearInterval(this.cleanup);
  }
  private async expire() {
    const expiresAt = { lt: new Date() };
    await this.store.db.authSession.deleteMany({ where: { expiresAt } });
    await this.store.db.authChallenge.deleteMany({ where: { expiresAt } });
  }
  async updateProfile(id: string, nickname: string) {
    return this.store.db.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`nickname:${nickname.toLowerCase()}`}, 0))`;
      const named = await db.account.findFirst({
        where: {
          nickname: { equals: nickname, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (named)
        throw new ConflictException('Этот ник уже занят. Выберите другой.');
      return publicAccount(
        await db.account.update({ where: { id }, data: { nickname } }),
      );
    });
  }

  async updateAvatar(id: string, image: string | null) {
    const avatar = image === null ? null : await prepareAvatar(image);
    return publicAccount(
      await this.store.db.account.update({
        where: { id },
        data: { avatar, avatarVersion: avatar ? randomUUID() : null },
      }),
    );
  }
  async avatar(id: string) {
    const account = await this.store.db.account.findUnique({
      where: { id },
      select: { avatar: true },
    });
    return account?.avatar;
  }
  providers() {
    return {
      yandex: !!(
        process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET
      ),
      twitch: !!(
        process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET
      ),
    };
  }
  async session(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const session = await this.store.db.authSession.findUnique({
      where: { tokenHash: digest(token) },
      include: { account: true },
    });
    return session &&
      session.expiresAt > new Date() &&
      session.authVersion === session.account.authVersion
      ? publicAccount(session.account)
      : null;
  }
  async require(token: string) {
    const account = await this.session(token);
    if (!account) throw new UnauthorizedException('Войдите в аккаунт.');
    return account;
  }
  async issue(accountId: string, observedVersion?: number) {
    const version =
      observedVersion ??
      (
        await this.store.db.account.findUniqueOrThrow({
          where: { id: accountId },
        })
      ).authVersion;
    const token = opaque();
    await this.store.db.authSession.create({
      data: {
        tokenHash: digest(token),
        accountId,
        authVersion: version,
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      },
    });
    return token;
  }
  async logout(token: string) {
    await this.store.db.authSession.deleteMany({
      where: { tokenHash: digest(token) },
    });
  }
  async register(email: string, password: string, nickname: string) {
    const verificationRequired =
      process.env.EMAIL_VERIFICATION_REQUIRED === 'true';
    if (verificationRequired) this.mailConfigured();
    const passwordHash = await hashPassword(password);
    const account = await this.store.db.$transaction(async (db) => {
      // Serialize registrations for the same address or case-insensitive nickname.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email:${email}`}, 0))`;
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`nickname:${nickname.toLowerCase()}`}, 0))`;
      const existing = await db.account.findUnique({ where: { email } });
      if (existing && (!verificationRequired || existing.emailVerifiedAt))
        throw new ConflictException(
          'Эта почта уже зарегистрирована. Войдите в аккаунт.',
        );
      const named = await db.account.findFirst({
        where: {
          nickname: { equals: nickname, mode: 'insensitive' },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
      });
      if (named)
        throw new ConflictException('Этот ник уже занят. Выберите другой.');
      return (
        existing ??
        db.account.create({ data: { email, passwordHash, nickname } })
      );
    });
    if (verificationRequired && !account.emailVerifiedAt)
      await this.sendChallenge(account.id, email, 'verify', passwordHash);
    return verificationRequired
      ? genericMail
      : {
          token: await this.issue(account.id, account.authVersion),
          account: publicAccount(account),
        };
  }
  async login(email: string, password: string) {
    const a = await this.store.db.account.findUnique({ where: { email } });
    // Equal-cost derivation even when this address has no password account.
    const valid = await verifyPassword(
      password,
      a?.passwordHash ??
        `scrypt:00000000000000000000000000000000:${'0'.repeat(128)}`,
    );
    if (!a || !valid)
      throw new UnauthorizedException('Неверная почта или пароль.');
    if (
      process.env.EMAIL_VERIFICATION_REQUIRED === 'true' &&
      !a.emailVerifiedAt
    )
      throw new UnauthorizedException(
        'Подтвердите почту. Повторная регистрация отправит письмо ещё раз.',
      );
    return {
      token: await this.issue(a.id, a.authVersion),
      account: publicAccount(a),
    };
  }
  async forgot(email: string) {
    this.mailConfigured();
    const a = await this.store.db.account.findUnique({ where: { email } });
    if (a?.passwordHash) await this.sendChallenge(a.id, email, 'reset');
    return genericMail;
  }
  private mailConfigured() {
    if (!process.env.SMTP_HOST)
      throw new ServiceUnavailableException(
        'Отправка писем пока не настроена.',
      );
  }
  private async sendChallenge(
    accountId: string,
    email: string,
    kind: 'verify' | 'reset',
    pendingPasswordHash?: string,
  ) {
    const token = opaque();
    await this.store.db.authChallenge.create({
      data: {
        tokenHash: digest(token),
        accountId,
        kind,
        verifier: pendingPasswordHash,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      connectionTimeout: 10000,
      socketTimeout: 15000,
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            },
          }
        : {}),
    });
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? 'Кадрово <hello@filmless.local>',
        to: email,
        subject:
          kind === 'verify'
            ? 'Подтвердите почту в Кадрово'
            : 'Восстановление пароля Кадрово',
        text: `Откройте ссылку в течение 30 минут:\n${webOrigin()}/account#${kind}=${token}\nЕсли вы не запрашивали письмо, проигнорируйте его.`,
      });
    } catch {
      await this.store.db.authChallenge.deleteMany({
        where: { tokenHash: digest(token) },
      });
      throw new ServiceUnavailableException(
        'Не удалось отправить письмо. Попробуйте позже.',
      );
    } finally {
      transport.close();
    }
  }
  async consume(token: string, kind: 'verify' | 'reset', password?: string) {
    const passwordHash = password ? await hashPassword(password) : undefined;
    await this.store.db.$transaction(async (tx) => {
      const challenge = await tx.authChallenge.findUnique({
        where: { tokenHash: digest(token) },
      });
      if (
        !challenge?.accountId ||
        challenge.kind !== kind ||
        challenge.expiresAt <= new Date()
      )
        throw new BadRequestException('Ссылка устарела или уже использована.');
      const consumed = await tx.authChallenge.deleteMany({
        where: { tokenHash: challenge.tokenHash },
      });
      if (!consumed.count)
        throw new BadRequestException('Ссылка уже использована.');
      if (kind === 'verify') {
        const account = await tx.account.findUniqueOrThrow({
          where: { id: challenge.accountId },
        });
        if (account.emailVerifiedAt)
          throw new BadRequestException('Почта уже подтверждена.');
      }
      await tx.account.update({
        where: { id: challenge.accountId },
        data:
          kind === 'verify'
            ? {
                emailVerifiedAt: new Date(),
                ...(challenge.verifier
                  ? { passwordHash: challenge.verifier }
                  : {}),
              }
            : {
                passwordHash,
                emailVerifiedAt: new Date(),
                authVersion: { increment: 1 },
              },
      });
      if (kind === 'verify')
        await tx.authChallenge.deleteMany({
          where: { accountId: challenge.accountId, kind: 'verify' },
        });
      if (kind === 'reset') {
        await tx.authSession.deleteMany({
          where: { accountId: challenge.accountId },
        });
        await tx.authChallenge.deleteMany({
          where: {
            accountId: challenge.accountId,
            kind: { in: ['reset', 'verify'] },
          },
        });
      }
    });
    return {
      message:
        kind === 'verify'
          ? 'Почта подтверждена. Теперь войдите.'
          : 'Пароль изменён. Войдите с новым паролем.',
    };
  }
}
