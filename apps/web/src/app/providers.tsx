'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MotionSystem, ScreenTransition } from '@/components/motion-system';
import { BackNavigation } from '@/components/back-navigation';
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
        <SiteHeader />
        <ScreenTransition>
          <BackNavigation />
          {children}
        </ScreenTransition>
      </MotionSystem>
    </QueryClientProvider>
  );
}
