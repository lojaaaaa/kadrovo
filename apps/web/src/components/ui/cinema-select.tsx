'use client';
import { Select } from 'radix-ui';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
export function CinemaSelect({
  id,
  value,
  onChange,
  options,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
  label?: string;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        id={id}
        aria-label={label}
        className="mt-2 flex h-12 w-full items-center justify-between gap-3 rounded-xl border bg-background/60 px-4 text-left text-sm shadow-sm outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="size-4 text-primary" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={8}
          className="z-50 max-h-80 w-[var(--radix-select-trigger-width)] min-w-48 overflow-hidden rounded-xl border bg-card p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95"
        >
          <Select.ScrollUpButton className="flex justify-center">
            <ChevronUp className="size-4" />
          </Select.ScrollUpButton>
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={o.value}
                className="relative cursor-pointer rounded-lg py-3 pl-4 pr-9 outline-none data-[highlighted]:bg-secondary data-[state=checked]:text-primary"
              >
                <Select.ItemText>{o.label}</Select.ItemText>
                {o.description && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {o.description}
                  </span>
                )}
                <Select.ItemIndicator className="absolute right-3 top-4">
                  <Check className="size-4" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="flex justify-center">
            <ChevronDown className="size-4" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
