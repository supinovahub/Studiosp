'use client';

import Link from 'next/link';
import { Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  const leads = useMemo(() => {
    const query = search.toLocaleLowerCase('pt-BR');
    return (data?.leads ?? []).filter((lead) => {
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
  }, [data?.leads, search, stage]);

  if (loading) return <LoadingState label="Carregando leads..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={data.role === 'agent' ? 'Carteira pessoal' : 'Operação'}
        title={data.role === 'agent' ? 'Meus leads' : 'Leads e oportunidades'}
        description="Cada contato pode gerar oportunidades ao longo do tempo. Na V1, esta lista mostra a oportunidade atual e seu próximo fato operacional."
      />
      <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Buscar por nome, telefone ou e-mail</span>
          <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail"
            className="h-9 pl-9"
          />
        </label>
        <select
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          aria-label="Filtrar por etapa"
          className="border-input bg-background text-foreground focus:border-ring h-9 rounded-lg border px-3 text-sm outline-none"
        >
          <option value="active">Em andamento</option>
          <option value="all">Todas as etapas</option>
          {Object.entries(stageLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {leads.length ? (
        <div className="border-border bg-card overflow-hidden rounded-lg border">
          <div className="border-border bg-muted/25 text-muted-foreground hidden grid-cols-[1.25fr_0.8fr_0.8fr_0.8fr_0.7fr] gap-4 border-b px-4 py-2 text-[10px] font-semibold tracking-wider uppercase lg:grid">
            <span>Lead</span>
            <span>Etapa</span>
            <span>Atenção</span>
            <span>Responsável</span>
            <span>Atualização</span>
          </div>
          <div className="divide-border divide-y">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="hover:bg-muted/35 grid gap-3 px-4 py-3 lg:grid-cols-[1.25fr_0.8fr_0.8fr_0.8fr_0.7fr] lg:items-center lg:gap-4"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">
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
                <p className="text-muted-foreground text-[11px]">
                  {formatDateTime(lead.updated_at)}
                </p>
              </Link>
            ))}
          </div>
        </div>
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
