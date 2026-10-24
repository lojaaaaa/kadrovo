'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MotionSystem, ScreenTransition } from '@/components/motion-system';
import { BackNavigation } from '@/components/back-navigation';
import { QueueResume } from '@/components/queue-resume';
import { AccessRedirect } from '@/components/access-redirect';
import { SiteHeader } from '@/components/site-header';
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MotionSystem>
        <AccessRedirect />
        <SiteHeader />
        <QueueResume />
        <ScreenTransition>
          <BackNavigation />
          {children}
        </ScreenTransition>
      </MotionSystem>
    </QueryClientProvider>
  );
}
