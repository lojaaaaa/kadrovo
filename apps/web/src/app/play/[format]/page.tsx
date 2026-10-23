import { SoloLaunch } from '@/components/solo-launch';
import {
  modeSchema,
  collectionSchema,
  categorySchema,
} from '@filmless/contracts';
import { notFound } from 'next/navigation';
import { CreateRoomForm } from '@/components/create-room';
import { JoinRoomForm } from '@/components/join-room';
import { Users, Clapperboard } from 'lucide-react';

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ format: string }>;
  searchParams: Promise<{
    mode?: string;
    collection?: string;
    category?: string;
  }>;
}) {
  const { format } = await params;
  if (format !== 'solo' && format !== 'party') notFound();
  const input = await searchParams;
  const mode = modeSchema.catch('frames').parse(input.mode);
  const collection = collectionSchema.catch('all').parse(input.collection);
  const category = categorySchema.catch('movies').parse(input.category);

  const isSolo = format === 'solo';
  const Icon = isSolo ? Clapperboard : Users;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 md:py-12">
      <div className="flex items-start gap-4 mb-8">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <Icon className="size-6 text-primary" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">
            {isSolo ? 'Одиночная игра' : 'Игра по ссылке'}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            {isSolo ? 'Только вы и кино' : 'Соберите свой кинозал'}
          </h1>
          <p className="mt-2 text-muted-foreground leading-relaxed">
            {isSolo
              ? 'Выберите режим и нажмите «Играть».'
              : 'Настройте комнату и поделитесь ссылкой. Друзья присоединятся без регистрации.'}
          </p>
        </div>
      </div>

      {isSolo ? (
        <SoloLaunch
          initialMode={mode}
          initialCollection={collection}
          initialCategory={category}
        />
      ) : (
        <CreateRoomForm
          initialFormat={format}
          initialMode={mode}
          initialCollection={collection}
          initialCategory={category}
        />
      )}

      {format === 'party' && (
        <div className="mt-6">
          <JoinRoomForm />
        </div>
      )}
    </main>
  );
}
