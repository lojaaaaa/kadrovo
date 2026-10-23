import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { createRoomSchema, joinRoomSchema } from '@filmless/contracts';
import { ContentCatalog } from '../content/catalog';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
@Controller('rooms')
export class RoomsController {
  constructor(
    @Inject(ContentCatalog) private readonly catalog: ContentCatalog,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(RoomsGateway) private readonly gateway: RoomsGateway,
  ) {}
  @Post('daily') async daily() {
    try {
      const { day, question } = await this.catalog.daily();
      return { ...this.rooms.createDaily(question, 'Игрок'), day };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Фильм дня недоступен.',
      );
    }
  }
  @Post() create(@Body() body: unknown) {
    const input = createRoomSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException('Проверьте ник, категорию и режим.');
    return this.rooms.create(input.data);
  }
  @Post(':code/join') join(@Param('code') code: string, @Body() body: unknown) {
    const input = joinRoomSchema.safeParse(body);
    if (!input.success || !/^[A-F0-9]{8}$/.test(code))
      throw new BadRequestException('Проверьте код комнаты и ник.');
    const session = this.rooms.join(code, input.data.nickname);
    this.gateway.publish(code);
    return session;
  }
}
