'use client';

import { useMemo, useState } from 'react';
import {
  BarChart3,
  CircleDollarSign,
  Download,
  Target,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStudiospData } from '@/hooks/use-studiosp-data';
import {
  formatCurrencyBRL,
  formatDateTime,
  labelFor,
  sourceLabels,
  stageLabels,
} from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { MetricStrip } from './metric-strip';
import { EmptyState, ErrorState, LoadingState } from './operational-state';

export function ReportsPage() {
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    brokerId: '',
    source: '',
    developmentId: '',
    stage: '',
  });
  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);
  const { data, loading, error, reload } = useStudiospData(
    'reports',
    undefined,
    query
  );
  if (loading) return <LoadingState label="Consolidando métricas..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  const report = data.report;
  const leads = report?.leads ?? [];
  const metrics = report?.metrics ?? {
    leads_received: 0,
    active_opportunities: 0,
    meetings_completed: 0,
    confirmed_revenue: 0,
    won_count: 0,
  };
  const stageCounts = new Map(
    (report?.stages ?? []).map((item) => [item.key, Number(item.count)])
  );
  const sourceCounts = new Map(
    (report?.sources ?? []).map((item) => [item.key, Number(item.count)])
  );
  const stages = Object.entries(stageLabels).map(([key, label]) => ({
    key,
    label,
    count: stageCounts.get(key) ?? 0,
  }));
  const sources = Object.entries(sourceLabels).map(([key, label]) => ({
    key,
    label,
    count: sourceCounts.get(key) ?? 0,
  }));
  const maxStage = Math.max(1, ...stages.map((item) => item.count));
  const maxSource = Math.max(1, ...sources.map((item) => item.count));

  function downloadCsv() {
    const header = [
      'Nome',
      'Telefone',
      'Origem',
      'Etapa',
      'Corretor',
      'Valor da venda',
      'Criado em',
    ];
    const rows = leads.map((lead) => [
      lead.contact?.name ?? '',
      lead.contact?.phone ?? '',
      labelFor(sourceLabels, lead.source_type),
      labelFor(stageLabels, lead.stage),
      lead.broker?.display_name ?? '',
      lead.won_gross_value ?? '',
      lead.created_at,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')
      )
      .join('\n');
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `studiosp-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Métricas auditáveis"
        title="Relatórios da operação"
        description="Indicadores derivados de fatos registrados. Os filtros avançados e integrações de mídia evoluem nas próximas versões sem alterar o modelo de dados da V1."
        actions={
          <Button onClick={downloadCsv} variant="outline">
            <Download /> Exportar CSV
          </Button>
        }
      />
      <MetricStrip
        items={[
          {
            label: 'Leads recebidos',
            value: metrics.leads_received,
            detail: 'No período filtrado',
            icon: Users,
            tone: 'primary',
          },
          {
            label: 'Oportunidades ativas',
            value: metrics.active_opportunities,
            detail: 'Ainda em andamento',
            icon: Target,
            tone: 'warning',
          },
          {
            label: 'Reuniões realizadas',
            value: metrics.meetings_completed,
            detail: 'Com fato humano registrado',
            icon: BarChart3,
            tone: 'success',
          },
          {
            label: 'Faturamento confirmado',
            value: formatCurrencyBRL(metrics.confirmed_revenue),
            detail: `${metrics.won_count} venda(s)`,
            icon: CircleDollarSign,
            tone: 'neutral',
          },
        ]}
      />
      <section className="border-border bg-card grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          type="date"
          aria-label="Período inicial"
          value={filters.dateFrom}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              dateFrom: event.target.value,
            }))
          }
        />
        <Input
          type="date"
          aria-label="Período final"
          value={filters.dateTo}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              dateTo: event.target.value,
            }))
          }
        />
        <ReportSelect
          label="Todos os corretores"
          value={filters.brokerId}
          onChange={(brokerId) =>
            setFilters((current) => ({ ...current, brokerId }))
          }
          options={(data.brokers ?? []).map((item) => ({
            value: String(item.id),
            label: String(item.display_name),
          }))}
        />
        <ReportSelect
          label="Todas as origens"
          value={filters.source}
          onChange={(source) =>
            setFilters((current) => ({ ...current, source }))
          }
          options={Object.entries(sourceLabels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <ReportSelect
          label="Todos os empreendimentos"
          value={filters.developmentId}
          onChange={(developmentId) =>
            setFilters((current) => ({ ...current, developmentId }))
          }
          options={(data.developments ?? []).map((item) => ({
            value: String(item.id),
            label: String(item.name),
          }))}
        />
        <ReportSelect
          label="Todas as etapas"
          value={filters.stage}
          onChange={(stage) =>
            setFilters((current) => ({ ...current, stage }))
          }
          options={Object.entries(stageLabels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <BarList title="Distribuição por etapa" items={stages} max={maxStage} />
        <BarList title="Origem dos leads" items={sources} max={maxSource} />
      </div>
      <section className="border-border bg-card overflow-hidden rounded-lg border">
        <div className="border-border border-b px-4 py-3">
          <h3 className="text-foreground text-sm font-semibold">
            Auditoria recente
          </h3>
          <p className="text-muted-foreground text-xs">
            Quem fez o quê, quando e por qual origem
          </p>
        </div>
        {(data.audit ?? []).length ? (
          <div className="divide-border divide-y">
            {(data.audit ?? []).slice(0, 100).map((item) => (
              <div
                key={String(item.id)}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="text-foreground text-sm">
                    {String(item.action).replaceAll('_', ' ')}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {String(item.entity_type).replaceAll('_', ' ')} ·{' '}
                    {String(item.actor_type) === 'ai'
                      ? 'IA'
                      : String(item.actor_type) === 'user'
                        ? 'Usuário'
                        : 'Sistema'}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">
                  {String(item.reason ?? '')}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {formatDateTime(String(item.created_at))}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              title="Auditoria ainda vazia"
              description="Alterações e decisões começarão a aparecer aqui durante a operação."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function BarList({
  title,
  items,
  max,
}: {
  title: string;
  items: { key: string; label: string; count: number }[];
  max: number;
}) {
  return (
    <section className="border-border bg-card rounded-lg border p-4">
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.filter((item) => item.count > 0).length ? (
          items
            .filter((item) => item.count > 0)
            .map((item) => (
              <div key={item.key}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">
                    {item.count}
                  </span>
                </div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{
                      width: `${Math.max(4, (item.count / max) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))
        ) : (
          <p className="text-muted-foreground text-sm">
            Sem dados suficientes.
          </p>
        )}
      </div>
    </section>
  );
}

function ReportSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border-input bg-background text-foreground h-9 min-w-0 rounded-lg border px-2 text-sm"
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
