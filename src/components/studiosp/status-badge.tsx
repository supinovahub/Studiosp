import { AlertTriangle, Check, Clock3, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const toneClasses = {
  neutral: 'border-border bg-muted/50 text-muted-foreground',
  primary: 'border-primary/35 bg-primary/10 text-primary',
  warning: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  success: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
  danger: 'border-red-500/35 bg-red-500/10 text-red-300',
};

export function StatusBadge({
  label,
  tone = 'neutral',
  compact = false,
}: {
  label: string;
  tone?: keyof typeof toneClasses;
  compact?: boolean;
}) {
  const Icon =
    tone === 'success'
      ? Check
      : tone === 'warning' || tone === 'danger'
        ? AlertTriangle
        : tone === 'primary'
          ? Clock3
          : Minus;
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        toneClasses[tone]
      )}
    >
      <Icon className={compact ? 'size-2.5' : 'size-3'} />
      {label}
    </span>
  );
}
