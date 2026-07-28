import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="border-border/70 flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between lg:pb-7">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-primary mb-2 text-[11px] font-semibold tracking-[0.18em] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-foreground text-[1.7rem] leading-[1.15] font-semibold tracking-[-0.025em] text-balance sm:text-3xl">
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6 text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
