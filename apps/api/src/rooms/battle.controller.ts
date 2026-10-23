import {
  Controller,
  Body,
  BadRequestException,
  Delete,
  Get,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { cookie, RateLimit, sameOrigin } from '../auth/security';
import { BattleService } from './battle.service';
@Controller('battle')
export class BattleController {
  private limits = new RateLimit();
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(BattleService) private readonly battle: BattleService,
  ) {}
  private async account(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const account = await this.auth.require(cookie(req, 'filmless_session'));
    this.limits.take(account.id, 120, 60_000);
    return account;
  }
  @Get('quick') async quickStatus(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.battle.quickStatus((await this.account(req, res)).id);
  }
  @Post('quick') async quickJoin(
    @Body() body: { kind?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    sameOrigin(req);
    if (body?.kind !== 'duel' && body?.kind !== 'group')
      throw new BadRequestException('Выберите режим.');
    return this.battle.quickJoin(await this.account(req, res), body.kind);
  }
  @Delete('quick') async quickCancel(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    sameOrigin(req);
    return this.battle.quickCancel((await this.account(req, res)).id);
  }
  @Get() async status(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.battle.status((await this.account(req, res)).id);
  }
  @Post() async join(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    sameOrigin(req);
    return this.battle.join(await this.account(req, res));
  }
  @Delete() async cancel(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    sameOrigin(req);
    return this.battle.cancel((await this.account(req, res)).id);
  }
}
