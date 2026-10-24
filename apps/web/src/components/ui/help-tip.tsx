'use client';
import { Popover } from 'radix-ui';
import { CircleHelp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
export function HelpTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const show = () => {
    cancel();
    setOpen(true);
  };
  const hide = () => {
    cancel();
    timer.current = setTimeout(() => setOpen(false), 140);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="help-tip-trigger"
          aria-label={label}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={(e) => {
            if (e.currentTarget.matches(':focus-visible')) show();
          }}
          onBlur={hide}
        >
          <CircleHelp size={16} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="help-tip-content"
          side="top"
          sideOffset={8}
          collisionPadding={16}
          onMouseEnter={show}
          onMouseLeave={hide}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
