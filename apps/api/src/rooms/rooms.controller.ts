import type { Request, Response } from 'express';
import { ExperienceService } from './experience.service';
import { interval, map, startWith, distinctUntilChanged } from 'rxjs';
import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
  Get,
  Sse,
  Req,
  Res,
} from '@nestjs/common';
import { createRoomSchema, joinRoomSchema } from '@filmless/contracts';
import { ContentCatalog } from '../content/catalog';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
@Controller('rooms')
export class RoomsController {
  constructor(
    @Inject(ExperienceService) private readonly experience: ExperienceService,
    @Inject(ContentCatalog) private readonly catalog: ContentCatalog,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(RoomsGateway) private readonly gateway: RoomsGateway,
  ) {}
  @Sse('activity/stream') stream() {
    return interval(2000).pipe(
      startWith(0),
      map(() => JSON.stringify(this.rooms.activity())),
      distinctUntilChanged(),
      map((raw) => ({ data: JSON.parse(raw) })),
    );
  }
  @Get('public') directory() {
    return this.rooms.directory();
  }
  @Get('activity') activity() {
    return this.rooms.activity();
  }
  @Post('daily') async daily(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { day, question } = await this.catalog.daily();
      return {
        ...this.rooms.createDaily(
          question,
          'Киноман',
          await this.experience.identity(req, res),
          day,
        ),
        day,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Фильм дня недоступен.',
      );
    }
  }
  @Post() async create(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = createRoomSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException('Проверьте ник, категорию и режим.');
    return this.rooms.create(
      input.data,
      await this.experience.identity(req, res),
    );
  }
  @Post(':code/join') async join(
    @Param('code') code: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = joinRoomSchema.safeParse(body);
    if (!input.success || !/^[A-F0-9]{8}$/.test(code))
      throw new BadRequestException('Проверьте код комнаты и ник.');
    const session = this.rooms.join(
      code,
      input.data.nickname,
      await this.experience.identity(req, res),
    );
    this.gateway.publish(code);
    return session;
  }
}
