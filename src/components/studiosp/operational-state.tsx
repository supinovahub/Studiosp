import type { LucideIcon } from 'lucide-react';
import { Inbox, LoaderCircle, RefreshCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LoadingState({
  label = 'Carregando dados da operação...',
}: {
  label?: string;
}) {
  return (
    <div
      className="border-border/70 surface-raised flex min-h-52 items-center justify-center rounded-2xl border"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <div className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-xl">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
        <div>
          <p className="text-foreground text-sm font-medium">
            Preparando esta área
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{label}</p>
        </div>
      </div>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-6 text-center"
      role="alert"
    >
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-red-500/10">
        <TriangleAlert className="size-5 text-red-400" />
      </div>
      <p className="text-foreground font-medium">
        Não foi possível carregar esta área
      </p>
      <p className="text-muted-foreground mt-1 max-w-lg text-sm">{error}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCcw /> Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-border/80 bg-card/55 flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center">
      <div className="border-border/70 bg-muted/60 mb-4 flex size-11 items-center justify-center rounded-xl border">
        <Icon className="text-muted-foreground size-5" />
      </div>
      <p className="text-foreground font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
