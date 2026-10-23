import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  checkpointReady,
  credentialFingerprint,
  markBlocked,
  readCheckpoint,
  saveCheckpoint,
  type SyncCheckpoint,
} from './checkpoint';
import { CatalogStore } from './store';
import { PoiskKinoClient } from './provider';
import { UnofficialClient } from './unofficial';
import { backfillPosters, syncAutomaticCatalog } from './auto-prepare';
@Injectable()
export class ContentSync implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(ContentSync.name);
  constructor(@Inject(CatalogStore) private readonly store: CatalogStore) {}
  onModuleInit() {
    if (
      process.env.CONTENT_AUTO_SYNC !== 'true' ||
      !(
        process.env.POISKKINO_API_KEY ||
        process.env.KINOPOISK_UNOFFICIAL_API_KEY
      )
    )
      return;
    void this.prepareExisting();
    this.timer = setInterval(() => void this.run(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async prepareExisting() {
    try {
      await backfillPosters(this.store, (line) => this.logger.log(line));
    } catch {
      this.logger.warn('Не удалось подготовить часть постеров.');
    }
  }
  private async persist(state: SyncCheckpoint) {
    await this.store.db.contentState.upsert({
      where: { key: 'sync' },
      create: { key: 'sync', value: JSON.parse(JSON.stringify(state)) },
      update: { value: JSON.parse(JSON.stringify(state)) },
    });
    await saveCheckpoint(state);
  }
  async run() {
    if (this.busy) return;
    this.busy = true;
    let state: SyncCheckpoint | undefined;
    const key =
      process.env.KINOPOISK_UNOFFICIAL_API_KEY ||
      process.env.POISKKINO_API_KEY ||
      '';
    const client = process.env.KINOPOISK_UNOFFICIAL_API_KEY
      ? new UnofficialClient(key)
      : new PoiskKinoClient(key);
    const fingerprint = credentialFingerprint(client.provider, key);
    try {
      const saved = await this.store.db.contentState.findUnique({
        where: { key: 'sync' },
      });
      if (process.env.CONTENT_STORAGE === 'postgres') {
        const [size] = await this.store.db.$queryRaw<
          { bytes: string }[]
        >`SELECT pg_database_size(current_database())::text AS bytes`;
        if (Number(size?.bytes) > 650_000_000) {
          this.logger.warn(
            'Автоимпорт приостановлен: достигнут бюджет хранения демокаталога.',
          );
          return;
        }
      }
      state = saved
        ? (saved.value as unknown as SyncCheckpoint)
        : await readCheckpoint();
      if (!checkpointReady(state, fingerprint)) return;
      if (Date.now() - state.lastAttempt < 2 * 60 * 60 * 1000) return;
      const save = () => this.persist(state!);
      state.lastAttempt = Date.now();
      await save();
      const type = ['movie', 'tv-series', 'cartoon'][state.index]!;
      const cursorKey = client.provider + ':' + type;
      const result = await syncAutomaticCatalog(
        this.store,
        client,
        client instanceof UnofficialClient ? 200 : 20,
        (line) => this.logger.log(line),
        {
          type,
          next: state.cursors[cursorKey],
          frameBudget: client instanceof UnofficialClient ? 10 : undefined,
        },
      );
      if (result.next) state.cursors[cursorKey] = result.next;
      else delete state.cursors[cursorKey];
      state.index = (state.index + 1) % 3;
      await save();
      this.logger.log(JSON.stringify({ type, ...result, next: undefined }));
    } catch (error) {
      if (state && markBlocked(state, fingerprint, error))
        await this.persist(state).catch(() => {});
      this.logger.warn(
        error instanceof Error
          ? error.message
          : 'Автоимпорт временно недоступен.',
      );
    } finally {
      this.busy = false;
    }
  }
}
