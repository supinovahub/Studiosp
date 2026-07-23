'use client';

import Link from 'next/link';
import { CalendarDays, Clock3, Video } from 'lucide-react';
import { useStudiospData } from '@/hooks/use-studiosp-data';
import { formatDateTime } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

export function AgendaPage() {
  const { data, loading, error, reload } = useStudiospData('agenda');
  if (loading) return <LoadingState label="Carregando agenda..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  const appointments = data.appointments ?? [];
  const upcoming = appointments.filter(
    (item) => new Date(item.ends_at) >= new Date()
  );
  const past = appointments
    .filter((item) => new Date(item.ends_at) < new Date())
    .reverse();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Agenda interna V1"
        title="Reuniões e cobertura garantida"
        description="A IA oferece apenas horários com cobertura pré-configurada. O Google Agenda entra em uma versão posterior; esta agenda já registra reserva, aceite, cancelamento e comparecimento."
      />
      <AppointmentSection
        title="Próximas reuniões"
        description="Pré-agendadas e confirmadas"
        appointments={upcoming}
      />
      {past.length ? (
        <AppointmentSection
          title="Histórico recente"
          description="Reuniões concluídas ou vencidas"
          appointments={past.slice(0, 30)}
          muted
        />
      ) : null}
    </div>
  );
}

function AppointmentSection({
  title,
  description,
  appointments,
  muted = false,
}: {
  title: string;
  description: string;
  appointments: NonNullable<
    ReturnType<typeof useStudiospData>['data']
  >['appointments'];
  muted?: boolean;
}) {
  const rows = appointments ?? [];
  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border border-b px-4 py-3">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {rows.length ? (
        <div className="divide-border divide-y">
          {rows.map((appointment) => (
            <Link
              key={appointment.id}
              href={`/leads/${appointment.opportunity_id}`}
              className={`hover:bg-muted/35 grid gap-3 px-4 py-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center ${muted ? 'opacity-70' : ''}`}
            >
              <div className="border-border bg-muted/50 text-primary flex size-10 items-center justify-center rounded-lg border">
                <CalendarDays className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-foreground truncate text-sm font-medium">
                  {appointment.lead?.contact?.name ??
                    appointment.lead?.contact?.phone ??
                    'Lead'}
                </p>
                <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                  <Clock3 className="size-3" />{' '}
                  {formatDateTime(appointment.starts_at)}
                </p>
              </div>
              <p className="text-muted-foreground text-xs">
                {appointment.broker?.display_name ?? 'Aguardando corretor'}
              </p>
              <StatusBadge
                compact
                label={
                  appointment.status === 'broker_confirmed'
                    ? 'Confirmada'
                    : appointment.status === 'completed'
                      ? 'Realizada'
                      : appointment.status === 'reserved'
                        ? 'Pré-agendada'
                        : appointment.status.replaceAll('_', ' ')
                }
                tone={
                  appointment.status === 'broker_confirmed' ||
                  appointment.status === 'completed'
                    ? 'success'
                    : 'warning'
                }
              />
              {appointment.meeting_url ? (
                <span className="text-primary flex items-center gap-1 text-xs">
                  <Video className="size-3" /> Link disponível
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="p-4">
          <EmptyState
            icon={CalendarDays}
            title="Nenhuma reunião nesta lista"
            description="As reservas feitas pela IA aparecerão aqui automaticamente."
          />
        </div>
      )}
    </section>
  );
}
