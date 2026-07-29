'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  Sparkles,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import { formatDateTime } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

type AttentionFilter = 'all' | 'critical' | 'overdue';

const filterLabels: Record<AttentionFilter, string> = {
  all: 'Todas',
  critical: 'Críticas',
  overdue: 'Vencidas',
};

export function AttentionPage() {
  const { data, loading, error, reload } = useStudiospData('attention');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AttentionFilter>('all');
  const now = Date.now();

  const items = useMemo(() => data?.attention ?? [], [data?.attention]);
  const overdueCount = items.filter(
    (item) => item.due_at && new Date(item.due_at).getTime() < now
  ).length;
  const criticalCount = items.filter(
    (item) => item.severity === 'critical'
  ).length;
  const visibleItems = items.filter((item) => {
    if (filter === 'critical') return item.severity === 'critical';
    if (filter === 'overdue')
      return Boolean(item.due_at && new Date(item.due_at).getTime() < now);
    return true;
  });

  if (loading) return <LoadingState label="Priorizando pendências..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;

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

  async function reviewDevelopment(
    attentionId: string,
    developmentId: string,
    decision: 'approve' | 'reject'
  ) {
    const reason =
      decision === 'reject'
        ? window.prompt('Informe o motivo da reprovação para o corretor:')
        : '';
    if (decision === 'reject' && !reason?.trim()) return;
    setSavingId(attentionId);
    setActionError(null);
    try {
      await runStudiospAction('review_development', {
        developmentId,
        decision,
        reason: reason?.trim() ?? '',
      });
      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível revisar o imóvel.'
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decisão humana"
        title="Central de atenção"
        description="Exceções que precisam de contexto, decisão ou acompanhamento. Resolver uma pendência não altera fatos comerciais por conta própria."
      />

      <section
        aria-label="Resumo das pendências"
        className="grid gap-3 sm:grid-cols-3"
      >
        <SummaryCard
          label="Pendências abertas"
          value={items.length}
          detail="Total da sua visão atual"
          icon={Sparkles}
          tone="primary"
        />
        <SummaryCard
          label="Críticas"
          value={criticalCount}
          detail={
            criticalCount ? 'Exigem decisão prioritária' : 'Nenhuma no momento'
          }
          icon={AlertTriangle}
          tone={criticalCount ? 'danger' : 'neutral'}
        />
        <SummaryCard
          label="Prazo vencido"
          value={overdueCount}
          detail={overdueCount ? 'Precisam de revisão' : 'Prazos sob controle'}
          icon={Clock3}
          tone={overdueCount ? 'warning' : 'success'}
        />
      </section>

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível concluir a ação</p>
            <p className="mt-0.5 text-xs text-red-400/85">{actionError}</p>
          </div>
        </div>
      ) : null}

      {items.length ? (
        <Card className="gap-0 py-0">
          <div className="border-border/65 flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                Fila de decisão
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Comece pelos itens críticos e com prazo vencido
              </p>
            </div>
            <div
              className="bg-muted/60 flex w-fit rounded-xl p-1"
              aria-label="Filtrar pendências"
            >
              {(Object.keys(filterLabels) as AttentionFilter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className={`min-h-8 rounded-lg px-3 text-xs font-medium transition-colors ${
                    filter === key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {filterLabels[key]}
                </button>
              ))}
            </div>
          </div>

          {visibleItems.length ? (
            <div className="divide-border/60 divide-y">
              {visibleItems.map((item) => {
                const overdue =
                  item.due_at && new Date(item.due_at).getTime() < now;
                const developmentId =
                  item.kind === 'development_review' &&
                  typeof item.context?.development_id === 'string'
                    ? item.context.development_id
                    : null;
                return (
                  <article
                    key={item.id}
                    className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <SeverityIcon severity={item.severity} />
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
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
                          <span
                            className={`text-tabular text-[11px] ${
                              overdue
                                ? 'font-semibold text-red-400'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {item.due_at
                              ? `${overdue ? 'Venceu' : 'Prazo'}: ${formatDateTime(item.due_at)}`
                              : 'Sem prazo definido'}
                          </span>
                        </div>
                        <h4 className="text-foreground text-sm font-semibold">
                          {item.title}
                        </h4>
                        <p className="text-muted-foreground mt-1 text-xs leading-5">
                          {item.lead?.contact?.name ??
                            item.lead?.contact?.phone ??
                            'Pendência geral da operação'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-11 lg:pl-0">
                      {developmentId ? (
                        <>
                          <Button
                            variant="outline"
                            render={
                              <Link href={`/imoveis?review=${developmentId}`} />
                            }
                          >
                            <Building2 /> Revisar cadastro
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              reviewDevelopment(
                                item.id,
                                developmentId,
                                'reject'
                              )
                            }
                            disabled={savingId === item.id}
                          >
                            <X /> Reprovar
                          </Button>
                          <Button
                            onClick={() =>
                              reviewDevelopment(
                                item.id,
                                developmentId,
                                'approve'
                              )
                            }
                            disabled={savingId === item.id}
                          >
                            <Check /> Aprovar e publicar
                          </Button>
                        </>
                      ) : null}
                      {item.opportunity_id ? (
                        <Button
                          variant="outline"
                          render={
                            <Link href={`/leads/${item.opportunity_id}`} />
                          }
                        >
                          Abrir contexto
                        </Button>
                      ) : null}
                      {!developmentId ? (
                        <Button
                          onClick={() => resolve(item.id)}
                          disabled={savingId === item.id}
                        >
                          <Check />
                          {savingId === item.id
                            ? 'Salvando...'
                            : 'Marcar como resolvida'}
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={CheckCircle2}
                title={`Nenhuma pendência ${filterLabels[filter].toLowerCase()}`}
                description="Altere o filtro para consultar os demais itens da fila."
              />
            </div>
          )}
        </Card>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="A operação está em dia"
          description="Nenhuma decisão humana está pendente neste momento."
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Sparkles;
  tone: 'primary' | 'danger' | 'warning' | 'success' | 'neutral';
}) {
  const toneClasses = {
    primary: 'bg-primary-soft text-primary',
    danger: 'bg-red-500/10 text-red-400',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    neutral: 'bg-muted text-muted-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-4 py-4">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="text-foreground text-tabular text-xl font-semibold">
            {value}
          </p>
          <p className="text-muted-foreground truncate text-[11px]">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function SeverityIcon({
  severity,
}: {
  severity: 'critical' | 'warning' | 'info';
}) {
  const classes =
    severity === 'critical'
      ? 'bg-red-500/10 text-red-400'
      : severity === 'warning'
        ? 'bg-warning-soft text-warning'
        : 'bg-primary-soft text-primary';
  const Icon =
    severity === 'critical'
      ? AlertTriangle
      : severity === 'warning'
        ? Clock3
        : Info;
  return (
    <div
      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${classes}`}
    >
      <Icon className="size-4" />
    </div>
  );
}
