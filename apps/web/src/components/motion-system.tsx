'use client';
import {
  LazyMotion,
  MotionConfig,
  domAnimation,
  useReducedMotion,
} from 'motion/react';
import * as m from 'motion/react-m';
import { usePathname } from 'next/navigation';

export function MotionSystem({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: 0.24, ease: [0.22, 0.72, 0.22, 1] }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/** Route changes animate once; live room updates keep the same mounted subtree. */
export function ScreenTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const reduced = useReducedMotion();
  return (
    <m.div
      className="screen-transition"
      key={path}
      initial={{ opacity: reduced ? 1 : 0.92 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.18 }}
    >
      {children}
    </m.div>
  );
}

export { m };
