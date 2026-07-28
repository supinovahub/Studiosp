'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  CircleDollarSign,
  Clock3,
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
import { Card } from '@/components/ui/card';
import { PageHeader } from './page-header';
import { MetricStrip } from './metric-strip';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

function SectionHeading({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="border-border/65 flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <h3 className="text-foreground text-sm font-semibold tracking-[-0.01em]">
          {title}
        </h3>
        <p className="text-muted-foreground mt-0.5 text-xs leading-5">
          {description}
        </p>
      </div>
      <Link
        href={href}
        className="text-primary hover:bg-primary-soft -mr-2 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors"
      >
        {action} <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}

function personName(
  lead:
    | {
        contact?: {
          name?: string | null;
          phone?: string | null;
        } | null;
      }
    | null
    | undefined
) {
  return lead?.contact?.name ?? lead?.contact?.phone ?? 'Lead sem nome';
}

export function OverviewPage({ broker = false }: { broker?: boolean }) {
  const { data, loading, error, reload } = useStudiospData(
    broker ? 'my-day' : 'overview'
  );
  if (loading)
    return (
      <LoadingState
        label={
          broker
            ? 'Organizando suas prioridades...'
            : 'Consolidando a operação...'
        }
      />
    );
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
  const criticalAttention = attention.filter(
    (item) => item.severity === 'critical'
  ).length;
  const nextAppointment = appointments
    .filter((appointment) => new Date(appointment.starts_at) >= new Date())
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()
    )[0];
  const nowLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={broker ? 'Meu trabalho' : 'Centro de comando'}
        title={broker ? 'Seu dia, em ordem' : 'Visão geral da operação'}
        description={
          broker
            ? 'Comece pelo que tem prazo, confirme suas reuniões e avance os leads sob sua responsabilidade.'
            : 'Acompanhe as exceções, a agenda e o avanço comercial sem perder o contexto da operação.'
        }
        actions={
          <Link
            href="/atencao"
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition-colors"
          >
            {attention.length
              ? `${attention.length} prioridade(s)`
              : 'Tudo em dia'}
            <ArrowRight className="size-4" />
          </Link>
        }
      />

      <section
        aria-label="Resumo do dia"
        className="border-border/70 bg-card/70 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <div>
          <p className="text-muted-foreground text-xs font-medium capitalize">
            {nowLabel}
          </p>
          <p className="text-foreground mt-1 text-base font-semibold tracking-[-0.015em]">
            {attention.length
              ? criticalAttention
                ? `${criticalAttention} item(ns) crítico(s) pedem decisão`
                : 'Existem prioridades aguardando sua ação'
              : 'Nenhuma exceção aberta neste momento'}
          </p>
        </div>
        <div className="bg-muted/55 flex items-center gap-3 rounded-xl px-3 py-2.5 sm:max-w-sm">
          <div className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Clock3 className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              Próximo compromisso
            </p>
            <p className="text-foreground truncate text-xs font-semibold">
              {nextAppointment
                ? `${personName(nextAppointment.lead)} · ${formatDateTime(nextAppointment.starts_at)}`
                : 'Agenda sem compromissos futuros'}
            </p>
          </div>
        </div>
      </section>

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
              ? 'Comece pelos prazos críticos'
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
            label: broker ? 'Vendas confirmadas' : 'Valor confirmado',
            value: broker
              ? leads.filter((lead) => lead.stage === 'won').length
              : formatCurrencyBRL(wonValue),
            detail: 'Com fato comercial registrado',
            icon: CircleDollarSign,
            tone: 'neutral',
          },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <Card className="gap-0 py-0">
          <SectionHeading
            title="Prioridades da operação"
            description="Decisões humanas que não podem ficar paradas"
            href="/atencao"
            action="Ver todas"
          />
          {attention.length ? (
            <div className="divide-border/60 divide-y">
              {attention.slice(0, 7).map((item) => (
                <Link
                  key={item.id}
                  href={
                    item.opportunity_id
                      ? `/leads/${item.opportunity_id}`
                      : '/atencao'
                  }
                  className="hover:bg-muted/35 focus-visible:bg-muted/35 group flex min-h-[4.5rem] items-center gap-3 px-4 py-3 transition-colors sm:px-5"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2.5 shrink-0 rounded-full ${
                      item.severity === 'critical'
                        ? 'bg-red-500 shadow-[0_0_0_4px_rgb(239_68_68_/_0.10)]'
                        : item.severity === 'warning'
                          ? 'bg-warning shadow-[0_0_0_4px_var(--warning-soft)]'
                          : 'bg-primary shadow-[0_0_0_4px_var(--primary-soft)]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-semibold">
                      {item.title}
                    </p>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {personName(item.lead)}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-muted-foreground text-[11px]">
                      {item.due_at ? formatDateTime(item.due_at) : 'Agora'}
                    </p>
                    <p className="text-primary mt-1 text-[11px] font-medium opacity-0 transition-opacity group-hover:opacity-100">
                      Abrir contexto
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={Sparkles}
                title="Nenhuma pendência aberta"
                description="Quando a IA ou a operação precisar de uma decisão humana, ela aparecerá aqui."
              />
            </div>
          )}
        </Card>

        <Card className="gap-0 py-0">
          <SectionHeading
            title="Próximas reuniões"
            description="Reservas e confirmações da agenda"
            href="/agenda"
            action="Abrir agenda"
          />
          {appointments.length ? (
            <div className="divide-border/60 divide-y">
              {appointments.slice(0, 6).map((appointment) => (
                <Link
                  key={appointment.id}
                  href={`/leads/${appointment.opportunity_id}`}
                  className="hover:bg-muted/35 flex min-h-[4.5rem] items-center gap-3 px-4 py-3 transition-colors sm:px-5"
                >
                  <div className="border-primary/15 bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-xl border">
                    <CalendarCheck className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-semibold">
                      {personName(appointment.lead)}
                    </p>
                    <p className="text-muted-foreground text-tabular mt-0.5 text-xs">
                      {formatDateTime(appointment.starts_at)}
                    </p>
                  </div>
                  <StatusBadge
                    compact
                    label={
                      appointment.status === 'broker_confirmed'
                        ? 'Confirmada'
                        : 'Reservada'
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
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={CalendarCheck}
                title="Agenda livre"
                description="As reuniões reservadas pela IA serão exibidas aqui."
              />
            </div>
          )}
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <SectionHeading
          title={broker ? 'Seus leads recentes' : 'Movimentações recentes'}
          description="A etapa reflete fatos registrados pela IA ou pela equipe"
          href="/leads"
          action="Abrir leads"
        />
        {leads.length ? (
          <div className="divide-border/60 divide-y">
            {leads.slice(0, 8).map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="hover:bg-muted/35 grid gap-3 px-4 py-3.5 transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto_12rem]"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {personName(lead)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                    {lead.lead_summary ??
                      'Resumo em formação durante a qualificação'}
                  </p>
                </div>
                <StatusBadge
                  label={labelFor(stageLabels, lead.stage)}
                  tone="primary"
                  compact
                />
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs lg:justify-end">
                  <UserRoundCheck className="size-3.5" />
                  <span className="truncate">
                    {lead.broker?.display_name ?? 'Ainda sem corretor'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <EmptyState
              title="Nenhum lead recebido"
              description="Assim que um contato entrar pelo WhatsApp ou for importado, a oportunidade aparecerá nesta visão."
            />
          </div>
        )}
      </Card>
    </div>
  );
}
