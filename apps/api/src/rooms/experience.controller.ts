import {
  BadRequestException,
  Catch,
  UseFilters,
  ArgumentsHost,
  ExceptionFilter,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ExperienceService } from './experience.service';
import { RoomsService } from './rooms.service';
import { CatalogStore } from '../content/store';
import { ContentCatalog } from '../content/catalog';
import { RateLimit, sameOrigin } from '../auth/security';
@Catch(z.ZodError)
class InvalidExperienceInput implements ExceptionFilter {
  catch(_error: z.ZodError, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(400)
      .json({ message: 'Проверьте данные запроса.' });
  }
}
@UseFilters(InvalidExperienceInput)
@Controller('experience')
export class ExperienceController {
  private limit = new RateLimit();
  constructor(
    @Inject(ExperienceService) private experience: ExperienceService,
    @Inject(RoomsService) private rooms: RoomsService,
    @Inject(CatalogStore) private store: CatalogStore,
    @Inject(ContentCatalog) private catalog: ContentCatalog,
  ) {}
  private async actor(req: Request, res: Response, write = false) {
    res.setHeader('Cache-Control', 'no-store');
    if (write) sameOrigin(req);
    const id = await this.experience.identity(req, res);
    this.limit.take(id, 120, 60000);
    return id;
  }
  @Get() async me(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.experience.summary(await this.actor(req, res));
  }
  @Post('watchlist') async watch(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const subject = await this.actor(req, res, true);
    const input = z
      .object({
        titleId: z.string().min(1).max(80),
        remove: z.boolean().optional(),
      })
      .strict()
      .parse(body);
    const data = this.experience.get(subject);
    const title = (['movies', 'series', 'animation'] as const)
      .flatMap((c) => this.catalog.options(c, 'catalog'))
      .find((t) => t.id === input.titleId);
    if (!title) throw new BadRequestException('Фильм недоступен.');
    data.watchlist = data.watchlist.filter((t) => t.id !== input.titleId);
    data.removedWatchlist = (data.removedWatchlist ?? []).filter(
      (id) => id !== input.titleId,
    );
    if (input.remove)
      data.removedWatchlist = [...data.removedWatchlist, input.titleId].slice(
        -500,
      );
    if (!input.remove) {
      if (data.watchlist.length >= 200)
        throw new BadRequestException('В списке уже 200 фильмов.');
      data.watchlist.unshift(title);
    }
    this.experience.save(subject);
    return { ok: true };
  }
  @Post('report') async report(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const subject = await this.actor(req, res, true);
    const input = z
      .object({
        code: z.string().regex(/^[A-F0-9]{8}$/),
        token: z.string().min(32).max(128),
        reason: z.enum(['broken', 'text', 'wrong-film']),
      })
      .strict()
      .parse(body);
    const value = this.rooms.report(input.code, input.token, input.reason);
    const key = `report:${subject}:${value.titleId}:${value.mode}:${value.stage}`;
    await this.store.db.contentState.upsert({
      where: { key },
      create: { key, value: { ...value, at: Date.now() } },
      update: { value: { ...value, at: Date.now() } },
    });
    return { ok: true };
  }
  @Post('challenge') async challenge(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const subject = await this.actor(req, res, true);
    const input = z
      .object({
        code: z.string().regex(/^[A-F0-9]{8}$/),
        token: z.string().min(32).max(128),
      })
      .strict()
      .parse(body);
    return this.rooms.challenge(input.code, input.token, subject);
  }
  @Get('challenge/:id') async challengeInfo(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const subject = await this.actor(req, res);
    const c = await this.experience.challenge(id);
    return {
      rounds: c.titleIds.length,
      mode: c.mode,
      seconds: c.seconds,
      expiresAt: c.expiresAt,
      played: this.experience.hasResult(c, subject),
      results: c.results
        .map(({ nickname, score, solved }) => ({ nickname, score, solved }))
        .sort((a, b) => b.score - a.score),
    };
  }
  @Post('challenge/:id') async join(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const subject = await this.actor(req, res, true);
    const input = z
      .object({ nickname: z.string().trim().min(1).max(24) })
      .strict()
      .parse(body);
    return this.rooms.joinChallenge(id, subject, input.nickname);
  }
  @Get('archive') async archiveList(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.actor(req, res);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return this.store.db.dailyChallenge.findMany({
      where: { day: { lte: today } },
      select: { day: true },
      orderBy: { day: 'desc' },
      take: 60,
    });
  }
  @Post('daily/:day') async archive(
    @Param('day') day: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const subject = await this.actor(req, res, true);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      day >
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Moscow',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date())
    )
      throw new BadRequestException('Архив ещё недоступен.');
    const record = await this.store.db.dailyChallenge.findUnique({
      where: { day },
    });
    if (!record) throw new BadRequestException('Задание не найдено.');
    const q = this.catalog.byIds([record.titleId], 'catalog')[0]!;
    return this.rooms.createDaily(q, 'Киноман', subject, day, true);
  }
}
