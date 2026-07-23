import type { LucideIcon } from 'lucide-react';

export interface MetricItem {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  tone?: 'primary' | 'warning' | 'success' | 'neutral';
}

const toneClass = {
  primary: 'text-primary bg-primary/10 border-primary/20',
  warning: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  success: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  neutral: 'text-muted-foreground bg-muted/50 border-border',
};

export function MetricStrip({ items }: { items: MetricItem[] }) {
  return (
    <div className="border-border bg-card grid overflow-hidden rounded-lg border sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`flex min-w-0 items-start gap-3 p-4 ${index < items.length - 1 ? 'border-border border-b sm:border-r xl:border-b-0' : ''}`}
        >
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${toneClass[item.tone ?? 'neutral']}`}
          >
            <item.icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{item.label}</p>
            <p className="text-foreground mt-0.5 text-xl font-semibold tracking-tight">
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
