import { SoloLaunch } from '@/components/solo-launch';
import {
  modeSchema,
  collectionSchema,
  categorySchema,
} from '@filmless/contracts';
import { notFound } from 'next/navigation';
import { CreateRoomForm } from '@/components/create-room';
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
    <main className="screen screen--play mx-auto max-w-5xl px-5 py-6 md:py-8">
      <div className="play-page-heading mb-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <Icon className="size-6 text-primary" />
        </span>
        <div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {isSolo ? 'Одиночная игра' : 'Создать комнату'}
          </h1>
          {isSolo && (
            <p className="mt-2 text-muted-foreground leading-relaxed">
              Выберите режим и нажмите «Играть».
            </p>
          )}
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
    </main>
  );
}
