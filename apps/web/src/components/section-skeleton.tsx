import { Skeleton } from './ui/skeleton';
export function SectionSkeleton({
  kind = 'list',
}: {
  kind?: 'list' | 'form' | 'profile' | 'game' | 'home';
}) {
  return (
    <div
      className={`section-skeleton section-skeleton--${kind}`}
      role="status"
      aria-label="Загрузка"
    >
      <span className="sr-only">Загрузка</span>
      <div aria-hidden="true">
        {kind === 'game' ? (
          <>
            <div className="mb-4 flex justify-between">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-12 w-20" />
            </div>
            <Skeleton className="h-[min(48dvh,420px)] w-full" />
            <Skeleton className="mt-4 h-12 w-full" />
          </>
        ) : kind === 'profile' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-80 w-full" />
            <div className="space-y-4">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        ) : kind === 'form' ? (
          <div className="space-y-4">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : kind === 'home' ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-52 w-full" />
              <Skeleton className="h-52 w-full" />
            </div>
            <Skeleton className="mt-4 h-40 w-full" />
          </>
        ) : (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export function PageSkeleton({
  kind = 'list',
}: {
  kind?: 'list' | 'form' | 'profile' | 'game' | 'home';
}) {
  return (
    <main className="screen mx-auto max-w-7xl px-5 py-6">
      <Skeleton className="mb-6 h-9 w-52" />
      <SectionSkeleton kind={kind} />
    </main>
  );
}
