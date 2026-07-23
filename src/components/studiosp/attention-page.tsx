'use client';

import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import { formatDateTime } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

export function AttentionPage() {
  const { data, loading, error, reload } = useStudiospData('attention');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  if (loading) return <LoadingState label="Priorizando pendências..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  const items = data.attention ?? [];

  async function resolve(id: string) {
    setSavingId(id);
    setActionError(null);
    try {
      await runStudiospAction('resolve_attention', {
        attentionId: id,
        resolution: { outcome: 'resolved_from_attention_center' },
      });
      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Não foi possível resolver.'
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Ação humana"
        title="Central de atenção"
        description="Tudo que a IA não deve decidir sozinha chega aqui com contexto, responsável e prazo. Resolver a pendência não altera fatos comerciais por conta própria."
      />
      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {actionError}
        </p>
      ) : null}
      {items.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.id}
              className={`bg-card rounded-lg border p-4 ${item.severity === 'critical' ? 'border-red-500/35' : item.severity === 'warning' ? 'border-amber-500/30' : 'border-border'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      compact
                      label={
                        item.severity === 'critical'
                          ? 'Crítica'
                          : item.severity === 'warning'
                            ? 'Atenção'
                            : 'Informativa'
                      }
                      tone={
                        item.severity === 'critical'
                          ? 'danger'
                          : item.severity === 'warning'
                            ? 'warning'
                            : 'primary'
                      }
                    />
                    <span className="text-muted-foreground text-[11px]">
                      {item.due_at
                        ? `Prazo: ${formatDateTime(item.due_at)}`
                        : 'Sem prazo definido'}
                    </span>
                  </div>
                  <h3 className="text-foreground text-sm font-semibold">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {item.lead?.contact?.name ??
                      item.lead?.contact?.phone ??
                      'Pendência geral da operação'}
                  </p>
                </div>
                <Sparkles className="size-5 shrink-0 text-amber-300" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.opportunity_id ? (
                  <Button
                    variant="outline"
                    render={<Link href={`/leads/${item.opportunity_id}`} />}
                  >
                    Abrir contexto
                  </Button>
                ) : null}
                <Button
                  onClick={() => resolve(item.id)}
                  disabled={savingId === item.id}
                >
                  <Check />{' '}
                  {savingId === item.id
                    ? 'Salvando...'
                    : 'Marcar como resolvida'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="A operação está em dia"
          description="Nenhuma decisão humana está pendente neste momento."
        />
      )}
    </div>
  );
}
