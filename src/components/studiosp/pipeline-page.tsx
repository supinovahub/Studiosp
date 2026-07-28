'use client';

import Link from 'next/link';
import { ArrowRight, LayoutDashboard, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useStudiospData } from '@/hooks/use-studiosp-data';
import { labelFor, stageLabels, stageOrder } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

export function PipelinePage() {
  const { data, loading, error, reload } = useStudiospData('pipeline');
  if (loading) return <LoadingState label="Montando o pipeline..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  const leads = data.leads ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leitura operacional"
        title="Pipeline orientado por fatos"
        description="A etapa muda quando a IA ou uma pessoa registra um fato válido. Consulte a esteira sem perder rastreabilidade."
      />

      <div className="border-primary/20 bg-primary-soft/50 flex items-start gap-3 rounded-2xl border p-4">
        <div className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
          <Sparkles className="size-4" />
        </div>
        <div>
          <p className="text-foreground text-sm font-semibold">
            Fatos movem o pipeline
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-5">
            Abra um lead para registrar reunião, proposta, negociação, contrato,
            venda ou perda. Os cards não são arrastados manualmente.
          </p>
        </div>
      </div>

      {leads.length ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-4">
            {stageOrder.map((stage) => {
              const stageLeads = leads.filter((lead) => lead.stage === stage);
              return (
                <section
                  key={stage}
                  className="border-border/70 bg-card/60 w-[18.5rem] shrink-0 rounded-2xl border"
                >
                  <div className="border-border/65 flex items-center justify-between border-b px-4 py-3.5">
                    <h3 className="text-foreground text-xs font-semibold tracking-[-0.01em]">
                      {labelFor(stageLabels, stage)}
                    </h3>
                    <span className="bg-muted text-muted-foreground flex min-w-6 items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold tabular-nums">
                      {stageLeads.length}
                    </span>
                  </div>
                  <div className="space-y-2.5 p-2.5">
                    {stageLeads.length ? (
                      stageLeads.map((lead) => (
                        <Link
                          key={lead.id}
                          href={`/leads/${lead.id}`}
                          className="border-border/70 bg-card hover:border-primary/35 hover:bg-muted/25 group block rounded-xl border p-3.5 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
                              {lead.contact?.name ??
                                lead.contact?.phone ??
                                'Lead'}
                            </p>
                            <ArrowRight className="text-muted-foreground size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
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
                      <div className="border-border text-muted-foreground rounded-xl border border-dashed p-5 text-center text-xs">
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
        <Card className="py-5">
          <EmptyState
            icon={LayoutDashboard}
            title="Pipeline ainda vazio"
            description="O primeiro lead recebido criará automaticamente uma oportunidade nesta esteira."
          />
        </Card>
      )}
    </div>
  );
}
