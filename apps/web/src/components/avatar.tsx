'use client';
import { useState } from 'react';
export function Avatar({
  src,
  name,
  className = 'size-11',
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10 font-bold text-primary ${className}`}
    >
      {src && failed !== src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Аватар ${name}`}
          width={256}
          height={256}
          className="size-full object-cover"
          onError={() => setFailed(src)}
        />
      ) : (
        <span aria-hidden="true">
          {name.trim().slice(0, 1).toLocaleUpperCase('ru') || '?'}
        </span>
      )}
    </span>
  );
}
