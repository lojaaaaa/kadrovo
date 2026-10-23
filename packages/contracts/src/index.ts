import { z } from 'zod';
export const categorySchema = z.enum(['movies', 'series', 'animation']);
export const modeSchema = z.enum(['frames', 'spotlight', 'mix', 'pixels']);
export const collectionSchema = z.enum([
  'all',
  'classics',
  'nineties',
  'noughties',
  'tens',
  'recent',
]);
export type CollectionId = z.infer<typeof collectionSchema>;
export const collectionDefinitions = [
  {
    id: 'all',
    name: 'Все произведения',
    description: 'Случайный выбор из всего каталога',
    from: 0,
    to: 9999,
  },
  {
    id: 'classics',
    name: 'До 1990-х',
    description: 'Классика, с которой всё начиналось',
    from: 0,
    to: 1989,
  },
  {
    id: 'nineties',
    name: '1990-е',
    description: 'Знакомые истории эпохи видеокассет',
    from: 1990,
    to: 1999,
  },
  {
    id: 'noughties',
    name: '2000-е',
    description: 'Большое кино нового тысячелетия',
    from: 2000,
    to: 2009,
  },
  {
    id: 'tens',
    name: '2010-е',
    description: 'Современные хиты и новые миры',
    from: 2010,
    to: 2019,
  },
  {
    id: 'recent',
    name: 'С 2020 года',
    description: 'Кино последних лет',
    from: 2020,
    to: 9999,
  },
] as const;
export const roundCountSchema = z.union([
  z.literal(3),
  z.literal(5),
  z.literal(7),
  z.literal(10),
]);
export type RoundCount = z.infer<typeof roundCountSchema>;
export const timeControlPresets = [
  { seconds: 15, id: 'bullet', name: 'Пуля', description: '15 сек · Молния' },
  { seconds: 30, id: 'blitz', name: 'Блиц', description: '30 сек · Быстро' },
  { seconds: 45, id: 'rapid', name: 'Рапид', description: '45 сек · Баланс' },
  {
    seconds: 60,
    id: 'classic',
    name: 'Классика',
    description: '60 сек · Стандарт',
  },
  {
    seconds: 90,
    id: 'relaxed',
    name: 'Марафон',
    description: '90 сек · Без спешки',
  },
] as const;
export const createRoomSchema = z
  .object({
    visibility: z.enum(['public', 'private']).optional(),
    collection: collectionSchema.optional(),
    nickname: z.string().trim().min(1).max(24),
    category: categorySchema,
    mode: modeSchema,
    source: z.enum(['demo', 'catalog']).optional(),
    format: z.enum(['party', 'solo']).optional(),
    roundSeconds: z
      .union([
        z.literal(15),
        z.literal(30),
        z.literal(45),
        z.literal(60),
        z.literal(90),
      ])
      .optional(),
    totalRounds: roundCountSchema.optional(),
  })
  .strict();
export const roomSettingsSchema = createRoomSchema.pick({
  collection: true,
  category: true,
  mode: true,
  source: true,
  roundSeconds: true,
  totalRounds: true,
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type CreateRoom = z.infer<typeof createRoomSchema>;
export const categoryLabels = {
  movies: 'Фильмы',
  series: 'Сериалы',
  animation: 'Мультфильмы',
} as const;
export const modeLabels = {
  pixels: 'Пиксели',
  frames: 'Кадры',
  spotlight: 'Лупа',
  mix: 'Микс',
} as const;
export const ANSWER_COOLDOWN_MS = 3_000;
export type Provider = 'poiskkino' | 'kinopoisk-unofficial' | 'tmdb';
export type ContentAsset = {
  provider: Provider;
  externalTitleId: string;
  kind: 'poster' | 'still' | 'backdrop';
  sourceUrl: string;
  rightsStatus: 'unreviewed' | 'approved' | 'rejected';
};

export const joinRoomSchema = z
  .object({ nickname: z.string().trim().min(1).max(24) })
  .strict();
export const roomAuthSchema = z
  .object({
    code: z.string().regex(/^[A-F0-9]{8}$/),
    token: z.string().min(32).max(128),
  })
  .strict();
export const readySchema = z.object({ ready: z.boolean() }).strict();
export const kickPlayerSchema = z
  .object({ playerId: z.string().uuid() })
  .strict();
export type RoomSnapshot = {
  collection?: CollectionId;
  format: 'party' | 'solo' | 'battle';
  roundSeconds: number;
  totalRounds: number;
  code: string;
  category: z.infer<typeof categorySchema>;
  mode: z.infer<typeof modeSchema>;
  source: 'demo' | 'catalog';
  hostId: string;
  revision: number;
  players: {
    id: string;
    nickname: string;
    ready: boolean;
    connected: boolean;
  }[];
  capacity: number;
  expiresAt: number;
  game?: GameSnapshot;
};
export type RoomSession = { code: string; token: string; playerId: string };
export type RoomAck = { ok: true } | { ok: false; message: string };

export const answerSchema = z
  .object({
    roundId: z.string().uuid(),
    commandId: z.string().uuid(),
    titleId: z.string().min(1).max(80),
  })
  .strict();
export type AnswerCommand = z.infer<typeof answerSchema>;
export const searchSchema = z
  .object({ query: z.string().trim().min(2).max(80) })
  .strict();
export type TitleOption = {
  posterUrl?: string;
  id: string;
  name: string;
  year: number | null;
  category: CreateRoom['category'];
};
export type GamePersonal = {
  roundId: string;
  solved: boolean;
  nextAllowedAt: number;
};
export type GameSnapshot = {
  matchId: string;
  roundId: string;
  phase: 'playing' | 'reveal' | 'finished';
  roundNumber: number;
  totalRounds: number;
  mode: 'frames' | 'spotlight' | 'pixels';
  stage: number;
  unlockedStage?: number;
  possibleScore?: number;
  personalExpired?: boolean;
  personalSkipped?: boolean;
  roundDurationMs?: number;
  startedAt: number;
  endsAt: number;
  nextAt: number;
  serverNow: number;
  image: string;
  answer?: TitleOption;
  demo: boolean;
  standings: {
    playerId: string;
    nickname: string;
    score: number;
    roundScore: number;
    solved: boolean;
    deadline?: number;
    expired?: boolean;
    skipped?: boolean;
    finishOrder?: number;
  }[];
};
export type AnswerAck =
  | {
      ok: true;
      status:
        'correct' | 'incorrect' | 'cooldown' | 'finished' | 'already-correct';
      score: number;
      nextAllowedAt: number;
    }
  | { ok: false; message: string };
export type SearchAck =
  { ok: true; titles: TitleOption[] } | { ok: false; message: string };

export type ContentAvailability = {
  collections?: {
    id: CollectionId;
    categories: {
      category: CreateRoom['category'];
      pixels?: number;
      frames: number;
      spotlight: number;
      mix: number;
    }[];
  }[];
  categories: {
    category: CreateRoom['category'];
    pixels?: number;
    frames: number;
    spotlight: number;
    mix: number;
  }[];
  ready: boolean;
};
