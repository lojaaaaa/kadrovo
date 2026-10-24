import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('ui-skeleton rounded-xl bg-secondary/80', className)}
      {...props}
    />
  );
}
