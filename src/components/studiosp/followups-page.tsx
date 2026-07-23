'use client';

import Link from 'next/link';
import { Clock3, MessageSquareText } from 'lucide-react';
import { useStudiospData } from '@/hooks/use-studiosp-data';
import { formatDateTime } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

export function FollowupsPage() {
  const { data, loading, error, reload } = useStudiospData('followups');
  if (loading) return <LoadingState label="Carregando follow-ups..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  const followups = data.followups ?? [];
  const leadMap = new Map((data.leads ?? []).map((lead) => [lead.id, lead]));
  const activePolicy = data.followupPolicies?.find(
    (policy) => policy.status === 'active'
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Recuperação"
        title="Esteira de follow-up"
        description="A cadência pausa quando o lead responde, avança com controle de horário e cria atenção humana se a sequência não resolver."
      />
      {activePolicy ? (
        <div className="border-primary/25 bg-primary/5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-foreground text-sm font-medium">
              {String(activePolicy.name)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Janela de envio: {String(activePolicy.window_start).slice(0, 5)}{' '}
              às {String(activePolicy.window_end).slice(0, 5)} · fuso de São
              Paulo
            </p>
          </div>
          <StatusBadge label="Cadência ativa" tone="success" />
        </div>
      ) : null}
      {followups.length ? (
        <div className="border-border bg-card overflow-hidden rounded-lg border">
          <div className="divide-border divide-y">
            {followups.map((followup) => {
              const lead = leadMap.get(String(followup.opportunity_id));
              return (
                <Link
                  key={String(followup.id)}
                  href={`/leads/${String(followup.opportunity_id)}`}
                  className="hover:bg-muted/35 grid gap-3 px-4 py-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center"
                >
                  <div className="border-border bg-muted/50 flex size-9 items-center justify-center rounded-lg border">
                    <MessageSquareText className="text-primary size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">
                      {lead?.contact?.name ?? lead?.contact?.phone ?? 'Lead'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Etapa {String(followup.step_number)} da cadência
                    </p>
                  </div>
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Clock3 className="size-3" />{' '}
                    {formatDateTime(String(followup.scheduled_for))}
                  </span>
                  <StatusBadge
                    compact
                    label={
                      String(followup.status) === 'scheduled'
                        ? 'Agendado'
                        : String(followup.status) === 'sent'
                          ? 'Enviado'
                          : String(followup.status) === 'failed'
                            ? 'Falhou'
                            : String(followup.status)
                    }
                    tone={
                      String(followup.status) === 'failed'
                        ? 'danger'
                        : String(followup.status) === 'sent'
                          ? 'success'
                          : 'warning'
                    }
                  />
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Clock3}
          title="Nenhum follow-up agendado"
          description="A esteira será criada quando um lead deixar de responder durante a qualificação."
        />
      )}
    </div>
  );
}
