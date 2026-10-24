'use client';
import { memo, useState } from 'react';
import Image from 'next/image';
import { Film } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
export const PosterImage = memo(function PosterImage({
  src,
  alt = '',
  className = '',
  loading = 'lazy',
  sizes = '160px',
}: {
  src?: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  sizes?: string;
}) {
  const [settled, setSettled] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const pending = !!src && settled !== src;
  return (
    <span className={`poster-image ${className}`} aria-busy={pending}>
      {pending && <Skeleton className="absolute inset-0" aria-hidden="true" />}
      {src && failed !== src ? (
        <Image
          src={src}
          fill
          sizes={sizes}
          unoptimized={!src.startsWith('https://')}
          decoding="async"
          alt={alt}
          loading={loading}
          referrerPolicy="no-referrer"
          style={{ opacity: pending ? 0 : 1 }}
          onLoad={() => setSettled(src)}
          onError={() => {
            setFailed(src);
            setSettled(src);
          }}
        />
      ) : (
        <Film aria-hidden="true" className="size-5 text-muted-foreground" />
      )}
    </span>
  );
});
