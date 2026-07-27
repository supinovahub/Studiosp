'use client';

import Link from 'next/link';
import {
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  MessageSquareMore,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import { formatDateTime } from '@/lib/studiosp/labels';
import type { StudiospAttention, StudiospData } from '@/lib/studiosp/types';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

type TaskGroup = 'now' | 'today' | 'next';

interface BrokerTask {
  id: string;
  kind: string;
  group: TaskGroup;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  dueAt?: string | null;
  opportunityId?: string | null;
  offerId?: string;
  actionLabel: string;
  href?: string;
}

export function AttentionPage() {
  const { data, loading, error, reload } = useStudiospData('attention');
  if (loading) return <LoadingState label="Priorizando pendências..." />;
  if (error || !data) {
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  }
  if (data.role === 'agent') {
    return <BrokerAttention data={data} reload={reload} />;
  }
  return <ManagementAttention data={data} reload={reload} />;
}

function BrokerAttention({
  data,
  reload,
}: {
  data: StudiospData;
  reload: () => Promise<void>;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const tasks = useMemo(() => buildBrokerTasks(data), [data]);
  const groups: {
    key: TaskGroup;
    title: string;
    description: string;
  }[] = [
    {
      key: 'now',
      title: 'Agora',
      description: 'Ações que já estão esperando por você',
    },
    {
      key: 'today',
      title: 'Hoje',
      description: 'Compromissos e registros deste dia',
    },
    {
      key: 'next',
      title: 'Próximas',
      description: 'O que vale preparar com antecedência',
    },
  ];

  async function acceptOffer(task: BrokerTask) {
    if (!task.offerId) return;
    setSavingId(task.id);
    setActionError(null);
    try {
      await runStudiospAction('respond_assignment', {
        offerId: task.offerId,
        response: 'accept',
      });
      await reload();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível aceitar esta reunião.'
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Seu trabalho"
        title="Minhas pendências"
        description="Uma fila pessoal com convites, reuniões e fatos comerciais que dependem da sua ação."
      />

      {actionError ? (
        <p
          role="alert"
          className="border-destructive/35 bg-destructive/10 text-destructive rounded-lg border px-3 py-2.5 text-sm"
        >
          {actionError}
        </p>
      ) : null}

      {tasks.length ? (
        <div className="space-y-5">
          {groups.map((group) => {
            const groupTasks = tasks.filter((task) => task.group === group.key);
            if (!groupTasks.length) return null;
            return (
              <section key={group.key} aria-labelledby={`tasks-${group.key}`}>
                <div className="mb-2.5 flex items-end justify-between gap-3">
                  <div>
                    <h2
                      id={`tasks-${group.key}`}
                      className="text-foreground text-sm font-semibold"
                    >
                      {group.title}
                    </h2>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {group.description}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {groupTasks.length}{' '}
                    {groupTasks.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>
                <div className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border">
                  {groupTasks.map((task) => (
                    <BrokerTaskRow
                      key={task.id}
                      task={task}
                      saving={savingId === task.id}
                      onAccept={() => acceptOffer(task)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="Você está em dia"
          description="Nenhum convite, reunião ou atualização comercial precisa da sua ação agora."
        />
      )}
    </div>
  );
}

function BrokerTaskRow({
  task,
  saving,
  onAccept,
}: {
  task: BrokerTask;
  saving: boolean;
  onAccept: () => void;
}) {
  const Icon =
    task.kind === 'assignment_offer'
      ? CalendarCheck
      : task.kind === 'meeting_outcome'
        ? Clock3
        : task.kind === 'meeting_upcoming'
          ? CalendarClock
          : task.kind === 'ai_handoff'
            ? MessageSquareMore
            : TriangleAlert;

  return (
    <article className="grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
          task.severity === 'critical'
            ? 'border-red-500/25 bg-red-500/10 text-red-300'
            : task.severity === 'warning'
              ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
              : 'border-primary/20 bg-primary/10 text-primary'
        }`}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-foreground text-sm font-semibold">
            {task.title}
          </h3>
          {task.severity === 'critical' ? (
            <StatusBadge compact label="Urgente" tone="danger" />
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {task.description}
        </p>
        {task.dueAt ? (
          <p className="text-muted-foreground mt-1.5 flex items-center gap-1 text-[11px] tabular-nums">
            <Clock3 className="size-3" />
            {task.kind === 'meeting_upcoming' ? 'Reunião' : 'Prazo'}:{' '}
            {formatDateTime(task.dueAt)}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {task.offerId ? (
          <>
            <Button onClick={onAccept} disabled={saving}>
              <Check /> {saving ? 'Aceitando...' : task.actionLabel}
            </Button>
            <Button variant="outline" render={<Link href="/equipe#convites" />}>
              Outras opções
            </Button>
          </>
        ) : task.href ? (
          <Button variant="outline" render={<Link href={task.href} />}>
            {task.actionLabel} <ChevronRight />
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function buildBrokerTasks(data: StudiospData): BrokerTask[] {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const appointments = data.appointments ?? [];
  const appointmentMap = new Map(
    appointments.map((appointment) => [appointment.id, appointment])
  );
  const tasks: BrokerTask[] = [];

  for (const offer of data.assignmentOffers ?? []) {
    if (offer.status !== 'pending') continue;
    const appointment = appointmentMap.get(String(offer.appointment_id));
    tasks.push({
      id: `offer:${String(offer.id)}`,
      kind: 'assignment_offer',
      group: 'now',
      severity:
        new Date(String(offer.expires_at)).getTime() - now.getTime() <
        15 * 60_000
          ? 'critical'
          : 'warning',
      title: 'Confirme uma nova reunião',
      description: appointment
        ? `A operação reservou ${formatDateTime(appointment.starts_at)} para você. Os dados do lead serão liberados após o aceite.`
        : 'Há uma reunião pré-agendada aguardando sua confirmação.',
      dueAt: String(offer.expires_at),
      offerId: String(offer.id),
      actionLabel: 'Aceitar reunião',
    });
  }

  for (const appointment of appointments) {
    if (appointment.broker_profile_id !== data.brokerProfileId) continue;
    if (appointment.status !== 'broker_confirmed') continue;
    const startsAt = new Date(appointment.starts_at);
    const endsAt = new Date(appointment.ends_at);
    const leadLabel =
      appointment.lead?.contact?.name ??
      appointment.lead?.contact?.phone ??
      'lead atribuído';

    if (endsAt <= now) {
      tasks.push({
        id: `outcome:${appointment.id}`,
        kind: 'meeting_outcome',
        group: 'now',
        severity: 'warning',
        title: 'Registre o resultado da reunião',
        description: `A reunião com ${leadLabel} já terminou. Informe comparecimento e próximo passo comercial.`,
        dueAt: appointment.ends_at,
        opportunityId: appointment.opportunity_id,
        actionLabel: 'Registrar resultado',
        href: `/leads/${appointment.opportunity_id}`,
      });
    } else if (startsAt <= endOfToday) {
      tasks.push({
        id: `upcoming:${appointment.id}`,
        kind: 'meeting_upcoming',
        group: 'today',
        severity: 'info',
        title: `Reunião com ${leadLabel}`,
        description:
          'Revise o resumo do lead e os empreendimentos compatíveis antes do horário.',
        dueAt: appointment.starts_at,
        opportunityId: appointment.opportunity_id,
        actionLabel: 'Preparar reunião',
        href: `/leads/${appointment.opportunity_id}`,
      });
    } else {
      tasks.push({
        id: `upcoming:${appointment.id}`,
        kind: 'meeting_upcoming',
        group: 'next',
        severity: 'info',
        title: `Reunião com ${leadLabel}`,
        description:
          'O contexto do lead já está disponível para sua preparação.',
        dueAt: appointment.starts_at,
        opportunityId: appointment.opportunity_id,
        actionLabel: 'Ver contexto',
        href: `/leads/${appointment.opportunity_id}`,
      });
    }
  }

  for (const item of data.attention ?? []) {
    const due = item.due_at ? new Date(item.due_at) : null;
    tasks.push({
      id: `attention:${item.id}`,
      kind: item.kind,
      group:
        item.severity === 'critical' || (due && due <= now)
          ? 'now'
          : due && due <= endOfToday
            ? 'today'
            : 'next',
      severity: item.severity,
      title: item.title,
      description:
        item.lead?.contact?.name ??
        item.lead?.contact?.phone ??
        'Abra o contexto para concluir a ação necessária.',
      dueAt: item.due_at,
      opportunityId: item.opportunity_id,
      actionLabel:
        item.kind === 'ai_handoff'
          ? 'Assumir atendimento'
          : item.kind === 'schedule_conflict'
            ? 'Resolver conflito'
            : 'Abrir contexto',
      href: item.opportunity_id ? `/leads/${item.opportunity_id}` : '/equipe',
    });
  }

  const groupOrder: Record<TaskGroup, number> = {
    now: 0,
    today: 1,
    next: 2,
  };
  return tasks.sort((a, b) => {
    if (groupOrder[a.group] !== groupOrder[b.group]) {
      return groupOrder[a.group] - groupOrder[b.group];
    }
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });
}

function ManagementAttention({
  data,
  reload,
}: {
  data: StudiospData;
  reload: () => Promise<void>;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Não foi possível resolver.'
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
        description="Tudo que a IA não deve decidir sozinha chega aqui com contexto, responsável e prazo."
      />
      {actionError ? (
        <p
          role="alert"
          className="border-destructive/35 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {actionError}
        </p>
      ) : null}
      {items.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <ManagementAttentionCard
              key={item.id}
              item={item}
              saving={savingId === item.id}
              onResolve={() => resolve(item.id)}
            />
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

function ManagementAttentionCard({
  item,
  saving,
  onResolve,
}: {
  item: StudiospAttention;
  saving: boolean;
  onResolve: () => void;
}) {
  return (
    <article
      className={`bg-card rounded-xl border p-4 ${
        item.severity === 'critical'
          ? 'border-red-500/35'
          : item.severity === 'warning'
            ? 'border-amber-500/30'
            : 'border-border'
      }`}
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
        <Button onClick={onResolve} disabled={saving}>
          <Check /> {saving ? 'Salvando...' : 'Marcar como resolvida'}
        </Button>
      </div>
    </article>
  );
}
