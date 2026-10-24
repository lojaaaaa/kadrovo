'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { markQueue } from './queue-resume';
export function AccessRedirect() {
  const router = useRouter();
  useEffect(() => {
    const redirect = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (
        typeof url === 'string' &&
        /^\/account\?reason=(guest-solo|guest-online|create-lobby)$/.test(url)
      ) {
        markQueue(false);
        router.push(url);
      }
    };
    window.addEventListener('kadrovo:access-required', redirect);
    return () =>
      window.removeEventListener('kadrovo:access-required', redirect);
  }, [router]);
  return null;
}
