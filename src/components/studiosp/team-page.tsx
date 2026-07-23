'use client';

import Link from 'next/link';
import {
  CalendarClock,
  Check,
  Save,
  UserPlus,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import { formatDateTime } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

const weekdays = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

export function TeamPage() {
  const { data, loading, error, reload } = useStudiospData('team');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  if (loading)
    return <LoadingState label="Carregando equipe e disponibilidade..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  const isManager = data.role === 'owner' || data.role === 'admin';
  const brokers = data.brokers ?? [];
  const profiles = data.profiles ?? [];
  const windows = data.windows ?? [];
  const currentBroker = brokers.find(
    (broker) => broker.id === data.brokerProfileId
  );

  async function run(
    action: string,
    payload: Record<string, unknown>,
    success: string
  ) {
    setSaving(true);
    setMessage(null);
    try {
      await runStudiospAction(action, payload);
      setMessage({ type: 'success', text: success });
      await reload();
    } catch (actionError) {
      setMessage({
        type: 'error',
        text:
          actionError instanceof Error
            ? actionError.message
            : 'Não foi possível salvar.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          isManager ? 'Distribuição e cobertura' : 'Meu perfil operacional'
        }
        title={
          isManager ? 'Equipe de corretores' : 'Disponibilidade e convites'
        }
        description={
          isManager
            ? 'Configure WhatsApp, prioridade, capacidade e horários garantidos. Rejeições e transferências ficam registradas para o dono.'
            : 'Controle sua disponibilidade e responda aos convites de reunião diretamente pelo painel.'
        }
        actions={
          isManager ? (
            <Button
              variant="outline"
              render={<Link href="/settings?tab=members" />}
            >
              <UserPlus /> Convidar usuário
            </Button>
          ) : undefined
        }
      />
      {message ? (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${message.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}
        >
          {message.text}
        </p>
      ) : null}

      {!isManager && currentBroker ? (
        <section className="border-primary/25 bg-primary/5 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              Disponibilidade para novos agendamentos
            </h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Quando indisponível, você sai temporariamente da distribuição
              automática.
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge
              label={currentBroker.is_available ? 'Disponível' : 'Indisponível'}
              tone={currentBroker.is_available ? 'success' : 'warning'}
            />
            <Button
              onClick={() =>
                run(
                  'set_availability',
                  { isAvailable: !currentBroker.is_available },
                  currentBroker.is_available
                    ? 'Você está indisponível.'
                    : 'Você está disponível.'
                )
              }
              disabled={saving}
              variant="outline"
            >
              Alterar
            </Button>
          </div>
        </section>
      ) : null}

      {!isManager ? (
        <AssignmentInbox data={data} saving={saving} run={run} />
      ) : null}

      {isManager ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {brokers.length ? (
            brokers.map((broker) => {
              const profile = profiles.find(
                (item) => item.id === broker.profile_id
              );
              const brokerWindows = windows.filter(
                (item) => item.broker_profile_id === broker.id
              );
              return (
                <article
                  key={String(broker.id)}
                  className="border-border bg-card overflow-hidden rounded-lg border"
                >
                  <div className="border-border flex items-start gap-3 border-b p-4">
                    <div className="border-primary/20 bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg border">
                      <UserRoundCheck className="text-primary size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-foreground truncate text-sm font-semibold">
                        {String(broker.display_name)}
                      </h3>
                      <p className="text-muted-foreground truncate text-xs">
                        {String(profile?.email ?? '')}
                      </p>
                    </div>
                    <StatusBadge
                      compact
                      label={
                        broker.is_available ? 'Disponível' : 'Indisponível'
                      }
                      tone={broker.is_available ? 'success' : 'warning'}
                    />
                  </div>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      run(
                        'save_broker',
                        {
                          brokerId: broker.id,
                          whatsappE164: form.get('whatsappE164'),
                          whatsappVerified:
                            form.get('whatsappVerified') === 'on',
                          routingPriority: form.get('routingPriority'),
                          maxParallelAssignments: form.get(
                            'maxParallelAssignments'
                          ),
                          isAvailable: broker.is_available,
                          isActive: broker.is_active,
                        },
                        'Corretor atualizado.'
                      );
                    }}
                    className="grid gap-3 p-4 sm:grid-cols-2"
                  >
                    <Field label="WhatsApp com DDI">
                      <Input
                        name="whatsappE164"
                        defaultValue={String(broker.whatsapp_e164 ?? '')}
                        placeholder="+5511999999999"
                      />
                    </Field>
                    <Field label="Prioridade de distribuição">
                      <Input
                        name="routingPriority"
                        type="number"
                        min="1"
                        defaultValue={String(broker.routing_priority ?? 100)}
                      />
                    </Field>
                    <Field label="Atendimentos simultâneos">
                      <Input
                        name="maxParallelAssignments"
                        type="number"
                        min="1"
                        defaultValue={String(
                          broker.max_parallel_assignments ?? 1
                        )}
                      />
                    </Field>
                    <label className="text-muted-foreground flex items-center gap-2 self-end pb-2 text-xs">
                      <input
                        name="whatsappVerified"
                        type="checkbox"
                        defaultChecked={Boolean(broker.whatsapp_verified_at)}
                        className="accent-primary size-4"
                      />{' '}
                      Número verificado
                    </label>
                    <div className="flex justify-end sm:col-span-2">
                      <Button type="submit" size="sm" disabled={saving}>
                        <Save /> Salvar corretor
                      </Button>
                    </div>
                  </form>
                  <div className="border-border border-t p-4">
                    <h4 className="text-foreground text-xs font-semibold">
                      Horários garantidos
                    </h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {brokerWindows.length ? (
                        brokerWindows.map((item) => (
                          <span
                            key={String(item.id)}
                            className="border-border bg-muted/30 text-muted-foreground rounded-lg border px-2 py-1 text-[11px]"
                          >
                            {weekdays[Number(item.weekday)]} ·{' '}
                            {String(item.start_time).slice(0, 5)}–
                            {String(item.end_time).slice(0, 5)}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Nenhum horário configurado.
                        </span>
                      )}
                    </div>
                    <WindowForm
                      brokerId={String(broker.id)}
                      saving={saving}
                      onSave={(payload) =>
                        run(
                          'save_window',
                          payload,
                          'Horário garantido adicionado.'
                        )
                      }
                    />
                  </div>
                </article>
              );
            })
          ) : (
            <div className="lg:col-span-2">
              <EmptyState
                icon={UserRoundCheck}
                title="Nenhum corretor cadastrado"
                description="Convide um usuário e atribua o perfil de corretor para criar a equipe operacional."
              />
            </div>
          )}
        </div>
      ) : null}

      {isManager ? <RejectionHistory data={data} /> : null}
    </div>
  );
}

function AssignmentInbox({
  data,
  saving,
  run,
}: {
  data: NonNullable<ReturnType<typeof useStudiospData>['data']>;
  saving: boolean;
  run: (
    action: string,
    payload: Record<string, unknown>,
    success: string
  ) => Promise<void>;
}) {
  const [reasonId, setReasonId] = useState('');
  const [notes, setNotes] = useState('');
  const pending = (data.assignmentOffers ?? []).filter(
    (item) =>
      item.status === 'pending' &&
      item.broker_profile_id === data.brokerProfileId
  );
  const appointmentMap = new Map(
    (data.appointments ?? []).map((item) => [item.id, item])
  );
  return (
    <section className="border-border bg-card rounded-lg border">
      <div className="border-border border-b px-4 py-3">
        <h3 className="text-foreground text-sm font-semibold">
          Convites de reunião
        </h3>
        <p className="text-muted-foreground text-xs">
          Aceite, rejeite ou transfira com motivo. A mesma resposta poderá ser
          feita pelo WhatsApp.
        </p>
      </div>
      {pending.length ? (
        <div className="divide-border divide-y">
          {pending.map((offer) => {
            const appointment = appointmentMap.get(
              String(offer.appointment_id)
            );
            return (
              <div key={String(offer.id)} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      Reunião em{' '}
                      {appointment
                        ? formatDateTime(String(appointment.starts_at))
                        : 'horário reservado'}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Responda até {formatDateTime(String(offer.expires_at))}
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      run(
                        'respond_assignment',
                        { offerId: offer.id, response: 'accept' },
                        'Reunião aceita e atribuída a você.'
                      )
                    }
                    disabled={saving}
                  >
                    <Check /> Aceitar
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <select
                    value={reasonId}
                    onChange={(event) => setReasonId(event.target.value)}
                    className="border-input bg-background text-foreground h-9 rounded-lg border px-2 text-sm"
                  >
                    <option value="">Motivo para rejeitar/transferir</option>
                    {(data.reasons ?? []).map((reason) => (
                      <option key={String(reason.id)} value={String(reason.id)}>
                        {String(reason.label)}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Explique o motivo"
                  />
                  <Button
                    variant="outline"
                    disabled={saving || !reasonId}
                    onClick={() =>
                      run(
                        'respond_assignment',
                        {
                          offerId: offer.id,
                          response: 'transfer',
                          reasonId,
                          notes,
                        },
                        'Transferência solicitada.'
                      )
                    }
                  >
                    <CalendarClock /> Transferir
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={saving || !reasonId}
                    onClick={() =>
                      run(
                        'respond_assignment',
                        {
                          offerId: offer.id,
                          response: 'reject',
                          reasonId,
                          notes,
                        },
                        'Reunião rejeitada com motivo registrado.'
                      )
                    }
                  >
                    <X /> Rejeitar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4">
          <EmptyState
            icon={CalendarClock}
            title="Nenhum convite pendente"
            description="Quando a IA reservar um horário compatível, o convite aparecerá aqui e no seu WhatsApp verificado."
          />
        </div>
      )}
    </section>
  );
}

function WindowForm({
  brokerId,
  saving,
  onSave,
}: {
  brokerId: string;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      brokerId,
      weekday: form.get('weekday'),
      startTime: form.get('startTime'),
      endTime: form.get('endTime'),
      slotInterval: form.get('slotInterval'),
      capacity: 1,
    });
    event.currentTarget.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="mt-3 grid gap-2 sm:grid-cols-[1fr_0.8fr_0.8fr_auto]"
    >
      <select
        name="weekday"
        required
        className="border-input bg-background text-foreground h-8 rounded-lg border px-2 text-xs"
      >
        <option value="">Dia...</option>
        {weekdays.map((day, index) => (
          <option key={day} value={index}>
            {day}
          </option>
        ))}
      </select>
      <Input name="startTime" type="time" required className="h-8" />
      <Input name="endTime" type="time" required className="h-8" />
      <input type="hidden" name="slotInterval" value="15" />
      <Button type="submit" size="sm" disabled={saving}>
        Adicionar
      </Button>
    </form>
  );
}

function RejectionHistory({
  data,
}: {
  data: NonNullable<ReturnType<typeof useStudiospData>['data']>;
}) {
  const history = (data.assignmentOffers ?? []).filter((item) =>
    ['rejected', 'transferred'].includes(String(item.status))
  );
  const brokerMap = new Map(
    (data.brokers ?? []).map((item) => [item.id, item])
  );
  const reasonMap = new Map(
    (data.reasons ?? []).map((item) => [item.id, item])
  );
  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border border-b px-4 py-3">
        <h3 className="text-foreground text-sm font-semibold">
          Rejeições e transferências
        </h3>
        <p className="text-muted-foreground text-xs">
          Motivos visíveis para acompanhamento do dono
        </p>
      </div>
      {history.length ? (
        <div className="divide-border divide-y">
          {history.map((item) => (
            <div
              key={String(item.id)}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto]"
            >
              <div>
                <p className="text-foreground text-sm font-medium">
                  {String(
                    brokerMap.get(item.broker_profile_id)?.display_name ??
                      'Corretor'
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  {String(
                    reasonMap.get(item.reason_id)?.label ??
                      'Motivo não identificado'
                  )}{' '}
                  · {String(item.response_notes ?? 'Sem observação')}
                </p>
              </div>
              <StatusBadge
                compact
                label={
                  item.status === 'transferred' ? 'Transferido' : 'Rejeitado'
                }
                tone="warning"
              />
              <span className="text-muted-foreground text-[11px]">
                {formatDateTime(String(item.responded_at))}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground p-5 text-center text-sm">
          Nenhuma rejeição ou transferência registrada.
        </p>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-xs font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}
