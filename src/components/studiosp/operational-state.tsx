import type { LucideIcon } from 'lucide-react';
import { Inbox, LoaderCircle, RefreshCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LoadingState({
  label = 'Carregando dados da operação...',
}: {
  label?: string;
}) {
  return (
    <div className="border-border bg-card flex min-h-48 items-center justify-center rounded-lg border">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="text-primary size-4 animate-spin" />
        {label}
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
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
      <TriangleAlert className="mb-3 size-6 text-red-300" />
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
    <div className="border-border bg-card/40 flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
      <div className="border-border bg-muted/60 mb-3 flex size-10 items-center justify-center rounded-lg border">
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
