'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route: window.location.pathname,
        message: error.message,
        digest: error.digest,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return (
    <div className="border-border/70 bg-card flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
        <AlertTriangle className="size-5" />
      </div>
      <h2 className="text-lg font-semibold">
        Não foi possível abrir esta tela
      </h2>
      <p className="text-muted-foreground max-w-md text-sm">
        O erro foi registrado para análise. Você pode tentar carregar novamente.
      </p>
      <Button onClick={unstable_retry}>Tentar novamente</Button>
    </div>
  );
}
