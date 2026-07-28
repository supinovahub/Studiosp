import type { LucideIcon } from 'lucide-react';

export interface MetricItem {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  tone?: 'primary' | 'warning' | 'success' | 'neutral';
}

const toneClass = {
  primary: 'text-primary bg-primary-soft border-primary/15',
  warning: 'text-warning bg-warning-soft border-warning/15',
  success: 'text-success bg-success-soft border-success/15',
  neutral: 'text-muted-foreground bg-muted/55 border-border/70',
};

export function MetricStrip({ items }: { items: MetricItem[] }) {
  return (
    <div className="border-border/70 surface-raised grid overflow-hidden rounded-2xl border sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`flex min-w-0 items-start gap-3.5 p-4 sm:p-5 ${index < items.length - 1 ? 'border-border/65 border-b sm:border-r xl:border-b-0' : ''}`}
        >
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${toneClass[item.tone ?? 'neutral']}`}
          >
            <item.icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{item.label}</p>
            <p className="text-foreground text-tabular mt-1 text-2xl font-semibold tracking-[-0.025em]">
              {item.value}
            </p>
            {item.detail ? (
              <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                {item.detail}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
