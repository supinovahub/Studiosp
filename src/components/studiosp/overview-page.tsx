'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck,
  CircleDollarSign,
  Sparkles,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { useStudiospData } from '@/hooks/use-studiosp-data';
import {
  formatCurrencyBRL,
  formatDateTime,
  labelFor,
  stageLabels,
} from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { MetricStrip } from './metric-strip';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

export function OverviewPage({ broker = false }: { broker?: boolean }) {
  const { data, loading, error, reload } = useStudiospData(
    broker ? 'my-day' : 'overview'
  );
  if (loading) return <LoadingState />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;

  const leads = data.leads ?? [];
  const attention = data.attention ?? [];
  const appointments = data.appointments ?? [];
  const activeLeads = leads.filter(
    (lead) => !['won', 'lost'].includes(lead.stage)
  );
  const today = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });
  const todayAppointments = appointments.filter(
    (appointment) =>
      new Date(appointment.starts_at).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      }) === today
  );
  const wonValue = leads
    .filter((lead) => lead.stage === 'won')
    .reduce((sum, lead) => sum + Number(lead.won_gross_value ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={broker ? 'Prioridades pessoais' : 'Centro de comando'}
        title={
          broker
            ? 'O que precisa acontecer hoje'
            : 'Operação de vendas em um só lugar'
        }
        description={
          broker
            ? 'Reuniões, confirmações e próximos passos dos leads sob sua responsabilidade.'
            : 'Acompanhe qualificação, atenção humana, agenda e avanço comercial sem mover cards manualmente.'
        }
        actions={
          <Link
            href="/atencao"
            className="bg-primary text-primary-foreground hover:bg-primary/85 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium"
          >
            Ver prioridades <ArrowRight className="size-4" />
          </Link>
        }
      />

      <MetricStrip
        items={[
          {
            label: broker ? 'Meus leads ativos' : 'Leads ativos',
            value: activeLeads.length,
            detail: 'Oportunidades em andamento',
            icon: Users,
            tone: 'primary',
          },
          {
            label: 'Precisam de atenção',
            value: attention.length,
            detail: attention.length
              ? 'Priorize os mais antigos'
              : 'Operação em dia',
            icon: Sparkles,
            tone: attention.length ? 'warning' : 'success',
          },
          {
            label: 'Reuniões hoje',
            value: todayAppointments.length,
            detail: 'Reservadas ou confirmadas',
            icon: CalendarCheck,
            tone: 'success',
          },
          {
            label: broker ? 'Vendas confirmadas' : 'Faturamento confirmado',
            value: broker
              ? leads.filter((lead) => lead.stage === 'won').length
              : formatCurrencyBRL(wonValue),
            detail: 'Com fato comercial registrado',
            icon: CircleDollarSign,
            tone: 'neutral',
          },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="border-border bg-card rounded-lg border">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                Fila de atenção
              </h3>
              <p className="text-muted-foreground text-xs">
                Decisões humanas que não podem ficar paradas
              </p>
            </div>
            <Link
              href="/atencao"
              className="text-primary text-xs font-medium hover:underline"
            >
              Ver todas
            </Link>
          </div>
          {attention.length ? (
            <div className="divide-border divide-y">
              {attention.slice(0, 7).map((item) => (
                <Link
                  key={item.id}
                  href={
                    item.opportunity_id
                      ? `/leads/${item.opportunity_id}`
                      : '/atencao'
                  }
                  className="hover:bg-muted/35 flex items-start gap-3 px-4 py-3"
                >
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${item.severity === 'critical' ? 'bg-red-400' : item.severity === 'warning' ? 'bg-amber-400' : 'bg-primary'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-medium">
                      {item.title}
                    </p>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {item.lead?.contact?.name ??
                        item.lead?.contact?.phone ??
                        'Pendência geral'}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {item.due_at ? formatDateTime(item.due_at) : 'Agora'}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                icon={Sparkles}
                title="Nenhuma pendência aberta"
                description="Quando a IA ou a operação precisar de uma decisão humana, ela aparecerá aqui."
              />
            </div>
          )}
        </section>

        <section className="border-border bg-card rounded-lg border">
          <div className="border-border border-b px-4 py-3">
            <h3 className="text-foreground text-sm font-semibold">
              Próximas reuniões
            </h3>
            <p className="text-muted-foreground text-xs">
              Horários reservados e confirmados
            </p>
          </div>
          {appointments.length ? (
            <div className="divide-border divide-y">
              {appointments.slice(0, 6).map((appointment) => (
                <Link
                  key={appointment.id}
                  href={`/leads/${appointment.opportunity_id}`}
                  className="hover:bg-muted/35 flex items-center gap-3 px-4 py-3"
                >
                  <div className="border-primary/20 bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg border">
                    <CalendarCheck className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-medium">
                      {appointment.lead?.contact?.name ??
                        appointment.lead?.contact?.phone ??
                        'Lead'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(appointment.starts_at)}
                    </p>
                  </div>
                  <StatusBadge
                    compact
                    label={
                      appointment.status === 'broker_confirmed'
                        ? 'Confirmada'
                        : 'Pré-agendada'
                    }
                    tone={
                      appointment.status === 'broker_confirmed'
                        ? 'success'
                        : 'warning'
                    }
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                icon={CalendarCheck}
                title="Agenda livre"
                description="As reuniões reservadas pela IA serão exibidas aqui."
              />
            </div>
          )}
        </section>
      </div>

      <section className="border-border bg-card rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              Leads que mudaram recentemente
            </h3>
            <p className="text-muted-foreground text-xs">
              A etapa reflete fatos registrados pela IA ou pela equipe
            </p>
          </div>
          <Link
            href="/leads"
            className="text-primary text-xs font-medium hover:underline"
          >
            Abrir leads
          </Link>
        </div>
        {leads.length ? (
          <div className="divide-border divide-y">
            {leads.slice(0, 8).map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="hover:bg-muted/35 grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">
                    {lead.contact?.name ??
                      lead.contact?.phone ??
                      'Lead sem nome'}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {lead.lead_summary ??
                      'Resumo em formação durante a qualificação'}
                  </p>
                </div>
                <StatusBadge
                  label={labelFor(stageLabels, lead.stage)}
                  tone="primary"
                  compact
                />
                <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                  <UserRoundCheck className="size-3" />{' '}
                  {lead.broker?.display_name ?? 'Ainda sem corretor'}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              title="Nenhum lead recebido"
              description="Assim que um contato entrar pelo WhatsApp ou for importado, a oportunidade aparecerá nesta visão."
            />
          </div>
        )}
      </section>
    </div>
  );
}
