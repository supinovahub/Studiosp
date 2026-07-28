'use client';

import Link from 'next/link';
import { AlertCircle, Search, UserRoundCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useStudiospData } from '@/hooks/use-studiosp-data';
import {
  attentionLabels,
  formatDateTime,
  labelFor,
  sourceLabels,
  stageLabels,
} from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

export function LeadsPage() {
  const { data, loading, error, reload } = useStudiospData('leads');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('active');
  const sourceLeads = data?.leads;
  const leads = useMemo(() => {
    const query = search.toLocaleLowerCase('pt-BR');
    return (sourceLeads ?? []).filter((lead) => {
      const matchesSearch = [
        lead.contact?.name,
        lead.contact?.phone,
        lead.contact?.email,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase('pt-BR').includes(query)
        );
      const matchesStage =
        stage === 'all' ||
        (stage === 'active' && !['won', 'lost'].includes(lead.stage)) ||
        lead.stage === stage;
      return matchesSearch && matchesStage;
    });
  }, [sourceLeads, search, stage]);

  if (loading) return <LoadingState label="Organizando os leads..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;

  const allLeads = sourceLeads ?? [];
  const activeCount = allLeads.filter(
    (lead) => !['won', 'lost'].includes(lead.stage)
  ).length;
  const attentionCount = allLeads.filter(
    (lead) => lead.attention_state !== 'no_action'
  ).length;
  const assignedCount = allLeads.filter((lead) => lead.broker).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={data.role === 'agent' ? 'Carteira pessoal' : 'Operação'}
        title={data.role === 'agent' ? 'Meus leads' : 'Leads e oportunidades'}
        description="Encontre rapidamente quem precisa de atenção, consulte o contexto e registre o próximo fato da oportunidade."
      />

      <section
        aria-label="Resumo dos leads"
        className="grid gap-3 sm:grid-cols-3"
      >
        <LeadMetric
          icon={Users}
          label="Em andamento"
          value={activeCount}
          detail="Oportunidades ativas"
          tone="primary"
        />
        <LeadMetric
          icon={AlertCircle}
          label="Pedem atenção"
          value={attentionCount}
          detail="Com próxima ação"
          tone={attentionCount ? 'warning' : 'success'}
        />
        <LeadMetric
          icon={UserRoundCheck}
          label="Com responsável"
          value={assignedCount}
          detail={`de ${allLeads.length} leads`}
          tone="neutral"
        />
      </section>

      <Card className="flex-col gap-3 p-3 py-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Buscar por nome, telefone ou e-mail</span>
          <Search className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-4" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail"
            className="h-10 rounded-xl pl-9"
          />
        </label>
        <select
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          aria-label="Filtrar por etapa"
          className="border-input bg-background text-foreground focus:border-ring h-10 rounded-xl border px-3 text-sm outline-none"
        >
          <option value="active">Em andamento</option>
          <option value="all">Todas as etapas</option>
          {Object.entries(stageLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground px-1 text-xs tabular-nums">
          {leads.length} resultado(s)
        </p>
      </Card>

      {leads.length ? (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-border/65 bg-muted/20 text-muted-foreground hidden grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_0.7fr] gap-4 border-b px-5 py-3 text-[10px] font-semibold tracking-wider uppercase lg:grid">
            <span>Lead</span>
            <span>Etapa</span>
            <span>Atenção</span>
            <span>Responsável</span>
            <span>Atualização</span>
          </div>
          <div className="divide-border/60 divide-y">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="hover:bg-muted/35 focus-visible:bg-muted/35 grid min-h-[4.75rem] gap-3 px-4 py-3.5 transition-colors sm:px-5 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_0.7fr] lg:items-center lg:gap-4"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {lead.contact?.name ?? 'Lead sem nome'}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {lead.contact?.phone ??
                      lead.contact?.email ??
                      labelFor(sourceLabels, lead.source_type)}
                  </p>
                </div>
                <StatusBadge
                  compact
                  label={labelFor(stageLabels, lead.stage)}
                  tone="primary"
                />
                <StatusBadge
                  compact
                  label={labelFor(attentionLabels, lead.attention_state)}
                  tone={
                    lead.attention_state === 'no_action' ? 'neutral' : 'warning'
                  }
                />
                <p className="text-muted-foreground truncate text-xs">
                  {lead.broker?.display_name ?? 'Ainda sem corretor'}
                </p>
                <p className="text-muted-foreground text-[11px] tabular-nums">
                  {formatDateTime(lead.updated_at)}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Users}
          title="Nenhum lead neste filtro"
          description="Altere os filtros ou aguarde a entrada de uma nova oportunidade pelo WhatsApp."
        />
      )}
    </div>
  );
}

function LeadMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  detail: string;
  tone: 'primary' | 'warning' | 'success' | 'neutral';
}) {
  const tones = {
    primary: 'bg-primary-soft text-primary',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    neutral: 'bg-muted text-muted-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-4 py-4">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="text-foreground text-xl font-semibold tabular-nums">
            {value}
          </p>
          <p className="text-muted-foreground truncate text-[11px]">{detail}</p>
        </div>
      </div>
    </Card>
  );
}
