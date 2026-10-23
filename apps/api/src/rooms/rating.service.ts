import { avatarUrl } from '../auth/avatar';
import { Controller, Get, Inject, Injectable, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CatalogStore } from '../content/store';
import { AuthService } from '../auth/auth.service';
import { cookie } from '../auth/security';
export function eloDelta(first: number, second: number, outcome: number) {
  return Math.round(32 * (outcome - 1 / (1 + 10 ** ((second - first) / 400))));
}
export type BattleOutcome = {
  matchId: string;
  firstId: string;
  secondId: string;
  firstScore: number;
  secondScore: number;
};
@Injectable()
export class RatingService {
  constructor(@Inject(CatalogStore) private store: CatalogStore) {}
  async record(result: BattleOutcome) {
    if (result.firstId === result.secondId) throw new Error('Same account');
    await this.store.db.$transaction(async (tx) => {
      // Serialize rating updates across API instances, including duplicate delivery.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(78236191)::text`;
      if (
        await tx.battleResult.findUnique({ where: { matchId: result.matchId } })
      )
        return;
      const a = await tx.account.findUniqueOrThrow({
        where: { id: result.firstId },
      });
      const b = await tx.account.findUniqueOrThrow({
        where: { id: result.secondId },
      });
      const outcome =
        result.firstScore === result.secondScore
          ? 0.5
          : result.firstScore > result.secondScore
            ? 1
            : 0;
      const delta = eloDelta(a.rating, b.rating, outcome);
      await tx.battleResult.create({ data: { ...result, delta } });
      await tx.account.update({
        where: { id: a.id },
        data: {
          rating: { increment: delta },
          battleGames: { increment: 1 },
          battleWins: { increment: outcome === 1 ? 1 : 0 },
        },
      });
      await tx.account.update({
        where: { id: b.id },
        data: {
          rating: { decrement: delta },
          battleGames: { increment: 1 },
          battleWins: { increment: outcome === 0 ? 1 : 0 },
        },
      });
    });
  }
  async table(accountId?: string) {
    const select = {
      avatarVersion: true,
      id: true,
      nickname: true,
      rating: true,
      battleGames: true,
      battleWins: true,
    } as const;
    const players = await this.store.db.account.findMany({
      where: { battleGames: { gt: 0 } },
      select,
      orderBy: [{ rating: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    const me = accountId
      ? await this.store.db.account.findUnique({
          where: { id: accountId },
          select,
        })
      : null;
    const place =
      me && me.battleGames
        ? 1 +
          (await this.store.db.account.count({
            where: {
              battleGames: { gt: 0 },
              OR: [
                { rating: { gt: me.rating } },
                { rating: me.rating, id: { lt: me.id } },
              ],
            },
          }))
        : null;
    return {
      players: players.map(({ avatarVersion, ...p }) => ({
        ...p,
        avatarUrl: avatarUrl({ ...p, avatarVersion }),
      })),
      me: me
        ? {
            id: me.id,
            nickname: me.nickname,
            rating: me.rating,
            battleGames: me.battleGames,
            battleWins: me.battleWins,
            avatarUrl: avatarUrl(me),
          }
        : null,
      place,
    };
  }
}
@Controller('ratings')
export class RatingController {
  constructor(
    @Inject(RatingService) private ratings: RatingService,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  @Get() async list(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const token = cookie(req, 'filmless_session');
    const account = token
      ? await this.auth.require(token).catch(() => null)
      : null;
    return this.ratings.table(account?.id);
  }
}
