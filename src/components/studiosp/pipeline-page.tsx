'use client';

import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { useStudiospData } from '@/hooks/use-studiosp-data';
import { labelFor, stageLabels, stageOrder } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

export function PipelinePage() {
  const { data, loading, error, reload } = useStudiospData('pipeline');
  if (loading) return <LoadingState label="Montando pipeline..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  const leads = data.leads ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Leitura operacional"
        title="Pipeline orientado por fatos"
        description="Os cards não são arrastados. A etapa muda quando a IA ou uma pessoa registra um fato válido, preservando métricas e auditoria."
      />
      {leads.length ? (
        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-max gap-3">
            {stageOrder.map((stage) => {
              const stageLeads = leads.filter((lead) => lead.stage === stage);
              return (
                <section
                  key={stage}
                  className="border-border bg-card/60 w-72 shrink-0 rounded-lg border"
                >
                  <div className="border-border flex items-center justify-between border-b px-3 py-2.5">
                    <h3 className="text-foreground text-xs font-semibold">
                      {labelFor(stageLabels, stage)}
                    </h3>
                    <span className="bg-muted text-muted-foreground flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                      {stageLeads.length}
                    </span>
                  </div>
                  <div className="space-y-2 p-2">
                    {stageLeads.length ? (
                      stageLeads.map((lead) => (
                        <Link
                          key={lead.id}
                          href={`/leads/${lead.id}`}
                          className="border-border bg-card hover:border-primary/35 hover:bg-muted/25 block rounded-lg border p-3"
                        >
                          <p className="text-foreground truncate text-sm font-medium">
                            {lead.contact?.name ??
                              lead.contact?.phone ??
                              'Lead'}
                          </p>
                          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
                            {lead.lead_summary ?? 'Qualificação em andamento'}
                          </p>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <StatusBadge
                              compact
                              label={
                                lead.attention_state === 'no_action'
                                  ? 'Sem pendência'
                                  : 'Atenção'
                              }
                              tone={
                                lead.attention_state === 'no_action'
                                  ? 'neutral'
                                  : 'warning'
                              }
                            />
                            <span className="text-muted-foreground max-w-28 truncate text-[10px]">
                              {lead.broker?.display_name ?? 'Sem corretor'}
                            </span>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
                        Nenhum lead
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={LayoutDashboard}
          title="Pipeline ainda vazio"
          description="O primeiro lead recebido criará automaticamente uma oportunidade nesta esteira."
        />
      )}
    </div>
  );
}
