import { CatalogTransferController } from './content/transfer.controller';
import { RatingService, RatingController } from './rooms/rating.service';
import { ContentSync } from './content/sync.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { OAuthService } from './auth/oauth.service';
import { BattleController } from './rooms/battle.controller';
import { BattleService } from './rooms/battle.service';
import { CatalogStore } from './content/store';
import { ContentCatalog, ContentController } from './content/catalog';
import { DemoCatalog } from './game/catalog';
import { RoomsService } from './rooms/rooms.service';
import { RoomsGateway } from './rooms/rooms.gateway';
import { RoomsController } from './rooms/rooms.controller';
import { Controller, Get, Module } from '@nestjs/common';
@Controller('health')
class HealthController {
  @Get() getHealth() {
    return { status: 'ok', service: 'filmless-api' };
  }
}
@Module({
  controllers: [
    HealthController,
    CatalogTransferController,
    RatingController,
    RoomsController,
    ContentController,
    AuthController,
    BattleController,
  ],
  providers: [
    ContentSync,
    RatingService,
    AuthService,
    OAuthService,
    BattleService,
    RoomsService,
    RoomsGateway,
    DemoCatalog,
    CatalogStore,
    ContentCatalog,
  ],
})
export class AppModule {}
