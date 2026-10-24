import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ContentCatalog } from '../content/catalog';
import { ExperienceService } from '../rooms/experience.service';
import { sameOrigin, RateLimit } from '../auth/security';
import { ChronologyGame } from './chronology';
const opaque = z.string().regex(/^[a-f0-9]{48}$/);
const command = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('start'),
      commandId: z.string().uuid().optional(),
    })
    .strict(),
  z.object({ action: z.literal('resume'), sessionId: opaque }).strict(),
  z
    .object({ action: z.literal('next'), sessionId: opaque, pairId: opaque })
    .strict(),
  z
    .object({
      action: z.literal('answer'),
      sessionId: opaque,
      pairId: opaque,
      commandId: z.string().uuid(),
      choice: z.enum(['earlier', 'later']),
    })
    .strict(),
]);
@Controller('chronology')
export class ChronologyController {
  private game = new ChronologyGame();
  private limit = new RateLimit();
  constructor(
    @Inject(ContentCatalog) private catalog: ContentCatalog,
    @Inject(ExperienceService) private experience: ExperienceService,
  ) {}
  @Post() async act(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    sameOrigin(req);
    this.limit.take('ip:' + req.ip, 120, 60000);
    res.setHeader('Cache-Control', 'no-store');
    const parsed = command.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Проверьте действие игры.');
    const subject = await this.experience.identity(req, res);
    this.limit.take(subject, 90, 60000);
    const c = parsed.data;
    if (c.action === 'start') {
      this.limit.take('start:' + subject, 10, 60000);
      const existing = this.game.started(subject, c.commandId);
      if (existing) return existing;
      this.experience.assertTrial(subject, 'solo');
      const game = this.game.start(
        subject,
        this.catalog.options('movies', 'catalog'),
        c.commandId,
      );
      this.experience.useTrial(subject, 'solo', game.sessionId);
      return game;
    }
    if (c.action === 'resume') return this.game.snapshot(c.sessionId, subject);
    if (c.action === 'next')
      return this.game.next(c.sessionId, subject, c.pairId);
    return this.game.answer(
      c.sessionId,
      subject,
      c.pairId,
      c.commandId,
      c.choice,
    );
  }
}
