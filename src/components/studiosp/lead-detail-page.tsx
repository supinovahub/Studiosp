'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  CalendarPlus,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  MessageSquare,
  Phone,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import {
  eventLabels,
  formatCurrencyBRL,
  formatDateTime,
  labelFor,
  sourceLabels,
} from '@/lib/studiosp/labels';
import type { StudiospLead } from '@/lib/studiosp/types';
import { LeadStatusBar } from './lead-status-bar';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

const humanActions = [
  ['meeting_completed', 'Confirmar reunião realizada'],
  ['meeting_no_show', 'Registrar que o lead não compareceu'],
  ['proposal_sent', 'Confirmar proposta enviada'],
  ['negotiation_started', 'Confirmar negociação iniciada'],
  ['contract_sent', 'Confirmar contrato enviado'],
  ['contract_signed', 'Confirmar contrato assinado'],
  ['sale_confirmed', 'Confirmar venda realizada'],
  ['lead_lost', 'Marcar como perdido'],
  ['appointment_reschedule_requested', 'Solicitar reagendamento'],
] as const;

export function LeadDetailPage({ id }: { id: string }) {
  const { data, loading, error, reload } = useStudiospData('lead', id);
  const [eventType, setEventType] = useState<string>('meeting_completed');
  const [reasonId, setReasonId] = useState('');
  const [notes, setNotes] = useState('');
  const [grossValue, setGrossValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [callOutcome, setCallOutcome] = useState('follow_up');
  const [callNotes, setCallNotes] = useState('');
  const [callReasonId, setCallReasonId] = useState('');
  const [activeTab, setActiveTab] = useState<
    'summary' | 'qualification' | 'matches' | 'history'
  >('summary');
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleHostId, setScheduleHostId] = useState('');
  const [scheduleStartsAt, setScheduleStartsAt] = useState('');
  const [scheduleDuration, setScheduleDuration] = useState('15');
  const [scheduleChannel, setScheduleChannel] = useState('phone');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [notifyLead, setNotifyLead] = useState(true);
  const [actionMessage, setActionMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  const [renderedAt] = useState(() => Date.now());
  const lead = data?.lead;

  const qualificationRows = useMemo(() => {
    const answerMap = new Map(
      (data?.answers ?? []).map((answer) => [
        String(answer.question_id),
        answer,
      ])
    );
    return (data?.questions ?? []).map((question) => ({
      question,
      answer: answerMap.get(String(question.id)),
    }));
  }, [data?.answers, data?.questions]);

  if (loading)
    return <LoadingState label="Carregando contexto completo do lead..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  if (!lead)
    return (
      <EmptyState
        title="Lead não encontrado"
        description="Ele pode ter sido encerrado ou não estar atribuído ao seu usuário."
      />
    );

  const lossReasons = (data.reasons ?? []).filter(
    (reason) => reason.category === 'loss'
  );
  const activeAppointment = (data.appointments ?? []).find((appointment) =>
    ['reserved', 'broker_confirmed'].includes(appointment.status)
  );

  async function registerFact() {
    setSaving(true);
    setActionMessage(null);
    try {
      if (eventType === 'lead_lost' && !reasonId)
        throw new Error('Selecione o motivo da perda.');
      await runStudiospAction('opportunity_event', {
        opportunityId: lead!.id,
        eventType,
        expectedStage: lead!.stage,
        reason: notes || null,
        payload: {
          reason_id: reasonId || null,
          gross_value: grossValue || null,
        },
      });
      setActionMessage({
        type: 'success',
        text: 'Fato registrado. A etapa foi recalculada com sucesso.',
      });
      setNotes('');
      setGrossValue('');
      setReasonId('');
      await reload();
    } catch (actionError) {
      setActionMessage({
        type: 'error',
        text:
          actionError instanceof Error
            ? actionError.message
            : 'Não foi possível registrar.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function completeCall() {
    setSaving(true);
    setActionMessage(null);
    try {
      if (callOutcome === 'not_interested' && !callReasonId)
        throw new Error('Selecione o motivo da perda.');
      await runStudiospAction('complete_broker_call', {
        opportunityId: lead!.id,
        expectedStage: lead!.stage,
        outcome: callOutcome,
        notes: callNotes,
        reasonId: callReasonId || null,
      });
      setCallDialogOpen(false);
      setCallNotes('');
      setCallReasonId('');
      setActionMessage({
        type: 'success',
        text: 'Call finalizada, pipeline atualizado e conversa encerrada.',
      });
      await reload();
    } catch (actionError) {
      setActionMessage({
        type: 'error',
        text:
          actionError instanceof Error
            ? actionError.message
            : 'Não foi possível finalizar a call.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function scheduleManualCall() {
    setSaving(true);
    setActionMessage(null);
    try {
      if (!scheduleHostId || !scheduleStartsAt) {
        throw new Error('Escolha o responsável, a data e o horário.');
      }
      const response = (await runStudiospAction('schedule_manual_appointment', {
        opportunityId: lead!.id,
        hostProfileId: scheduleHostId,
        startsAt: new Date(scheduleStartsAt).toISOString(),
        durationMinutes: Number(scheduleDuration),
        channel: scheduleChannel,
        notes: scheduleNotes || null,
        notifyLead,
      })) as { notificationWarning?: string | null };
      setScheduleDialogOpen(false);
      setScheduleNotes('');
      setActionMessage({
        type: response.notificationWarning ? 'error' : 'success',
        text:
          response.notificationWarning ??
          'Call agendada e confirmação enviada ao lead.',
      });
      await reload();
    } catch (actionError) {
      setActionMessage({
        type: 'error',
        text:
          actionError instanceof Error
            ? actionError.message
            : 'Não foi possível agendar a call.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/leads"
        className="text-muted-foreground hover:bg-muted hover:text-foreground -ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors"
      >
        <ArrowLeft className="size-3" /> Voltar para leads
      </Link>
      <PageHeader
        eyebrow={labelFor(sourceLabels, lead.source_type)}
        title={lead.contact?.name ?? lead.contact?.phone ?? 'Lead sem nome'}
        description={
          lead.lead_summary ??
          'O resumo será construído pela IA à medida que a qualificação avançar.'
        }
        actions={
          <>
            {data.role !== 'agent' ? (
              <Button onClick={() => setScheduleDialogOpen(true)}>
                <CalendarPlus /> Agendar call
              </Button>
            ) : null}
            {lead.primary_conversation_id ? (
              <Button
                variant="outline"
                render={
                  <Link
                    href={`/inbox?conversation=${lead.primary_conversation_id}`}
                  />
                }
              >
                <MessageSquare /> Abrir conversa
              </Button>
            ) : null}
            {lead.contact?.phone ? (
              <Button
                variant="outline"
                render={<a href={`tel:${lead.contact.phone}`} />}
              >
                <Phone /> Ligar
              </Button>
            ) : null}
          </>
        }
      />
      <LeadStatusBar lead={lead} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-5">
          <div
            className="border-border/70 bg-card/80 sticky top-[4.5rem] z-10 flex gap-1 overflow-x-auto rounded-xl border p-1 shadow-sm backdrop-blur-md"
            role="tablist"
            aria-label="Contexto do lead"
          >
            {[
              ['summary', 'Resumo'],
              ['qualification', 'Qualificação'],
              ['matches', 'Oportunidades'],
              ['history', 'Histórico'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={activeTab === value}
                onClick={() =>
                  setActiveTab(
                    value as 'summary' | 'qualification' | 'matches' | 'history'
                  )
                }
                className={`min-h-9 min-w-fit rounded-lg px-3 text-xs font-semibold transition-colors ${
                  activeTab === value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'summary' ? <CallBriefSection lead={lead} /> : null}

          {activeTab === 'qualification' ? (
            <section className="border-border/70 bg-card overflow-hidden rounded-2xl border">
              <div className="border-border/65 flex items-center justify-between border-b px-4 py-4 sm:px-5">
                <div>
                  <h3 className="text-foreground text-sm font-semibold">
                    Qualificação
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Respostas normalizadas e confirmadas no contexto da
                    oportunidade
                  </p>
                </div>
                <StatusBadge
                  label={`${qualificationRows.filter((row) => row.answer).length}/${qualificationRows.length} respondidas`}
                  tone={
                    lead.qualification_status === 'completed'
                      ? 'success'
                      : 'primary'
                  }
                />
              </div>
              <div className="divide-border/60 divide-y">
                {qualificationRows.map(({ question, answer }) => (
                  <div
                    key={String(question.id)}
                    className="grid gap-1 px-4 py-3.5 sm:grid-cols-[0.9fr_1.1fr] sm:gap-4 sm:px-5"
                  >
                    <p className="text-muted-foreground text-xs font-medium">
                      {String(question.label)}
                    </p>
                    <div>
                      <p className="text-foreground text-sm">
                        {answer
                          ? readableValue(answer.normalized_value)
                          : 'Ainda não respondida'}
                      </p>
                      {answer ? (
                        <>
                          {shouldShowRawAnswer(
                            answer.normalized_value,
                            answer.raw_text
                          ) ? (
                            <p className="text-muted-foreground mt-0.5 text-[10px]">
                              Resposta original: “{String(answer.raw_text)}”
                            </p>
                          ) : null}
                          <p className="text-muted-foreground mt-0.5 text-[10px]">
                            Confiança:{' '}
                            {Math.round(Number(answer.confidence ?? 0) * 100)}%
                            {' · '}
                            {String(answer.status) === 'confirmed'
                              ? 'confirmada'
                              : 'provisória'}
                          </p>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === 'matches' ? (
            <section className="border-border/70 bg-card overflow-hidden rounded-2xl border">
              <div className="border-border/65 border-b px-4 py-4 sm:px-5">
                <h3 className="text-foreground text-sm font-semibold">
                  Empreendimentos compatíveis
                </h3>
                <p className="text-muted-foreground text-xs">
                  Visível para a equipe; o lead recebe apenas uma abordagem
                  geral sobre algumas oportunidades
                </p>
              </div>
              {(data.matches ?? []).length ? (
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {(data.matches ?? []).map((match) => {
                    const development = match.development as Record<
                      string,
                      unknown
                    > | null;
                    const offer = match.offer as Record<string, unknown> | null;
                    return (
                      <article
                        key={String(match.id)}
                        className="border-border/70 bg-muted/20 rounded-xl border p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="border-primary/20 bg-primary-soft flex size-9 items-center justify-center rounded-xl border">
                            <Building2 className="text-primary size-4" />
                          </div>
                          <StatusBadge
                            compact
                            label={`${Math.round(Number(match.score))}% compatível`}
                            tone="success"
                          />
                        </div>
                        <h4 className="text-foreground mt-3 text-sm font-semibold">
                          {String(development?.name ?? 'Empreendimento')}
                        </h4>
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
                          {String(
                            development?.description ??
                              'Descrição disponível no catálogo.'
                          )}
                        </p>
                        {offer ? (
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">Metragem</p>
                              <p className="text-foreground font-medium">
                                A partir de {String(offer.area_min_sqm)} m²
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Preço</p>
                              <p className="text-foreground font-medium">
                                {formatCurrencyBRL(offer.price_from as number)}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState
                    icon={Building2}
                    title="Matching ainda não calculado"
                    description="O cruzamento será executado quando a qualificação tiver dados suficientes."
                  />
                </div>
              )}
            </section>
          ) : null}

          {activeTab === 'history' ? (
            <section className="border-border/70 bg-card overflow-hidden rounded-2xl border">
              <div className="border-border/65 border-b px-4 py-4 sm:px-5">
                <h3 className="text-foreground text-sm font-semibold">
                  Histórico imutável
                </h3>
                <p className="text-muted-foreground text-xs">
                  Linha do tempo de fatos da oportunidade
                </p>
              </div>
              {(data.events ?? []).length ? (
                <div className="divide-border/60 divide-y">
                  {(data.events ?? []).map((event) => (
                    <div
                      key={String(event.id)}
                      className="flex gap-3 px-4 py-3.5 sm:px-5"
                    >
                      <div className="border-border bg-muted/50 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border">
                        <CheckCircle2 className="text-primary size-3.5" />
                      </div>
                      <div>
                        <p className="text-foreground text-sm">
                          {labelFor(eventLabels, String(event.event_type))}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-[11px]">
                          {formatDateTime(String(event.occurred_at))} ·{' '}
                          {actorLabel(String(event.actor_type))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState
                    title="Sem eventos registrados"
                    description="Os próximos fatos aparecerão nesta linha do tempo."
                  />
                </div>
              )}
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[4.5rem] xl:self-start">
          <section className="border-primary/20 bg-primary-soft/45 rounded-2xl border p-4">
            <div className="flex items-start gap-3">
              <div className="border-primary/20 bg-primary-soft flex size-9 shrink-0 items-center justify-center rounded-xl border">
                <ClipboardCheck className="text-primary size-4" />
              </div>
              <div>
                <h3 className="text-foreground text-sm font-semibold">
                  Registrar fato humano
                </h3>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  Você informa o que aconteceu; o sistema valida e move a etapa.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-muted-foreground mb-1 block text-xs font-medium">
                  O que aconteceu?
                </span>
                <select
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value)}
                  className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
                >
                  {humanActions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {eventType === 'lead_lost' ? (
                <label className="block">
                  <span className="text-muted-foreground mb-1 block text-xs font-medium">
                    Motivo da perda
                  </span>
                  <select
                    value={reasonId}
                    onChange={(event) => setReasonId(event.target.value)}
                    className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {lossReasons.map((reason) => (
                      <option key={String(reason.id)} value={String(reason.id)}>
                        {String(reason.label)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {eventType === 'sale_confirmed' ? (
                <label className="block">
                  <span className="text-muted-foreground mb-1 block text-xs font-medium">
                    Valor bruto da venda
                  </span>
                  <Input
                    type="number"
                    min="0"
                    value={grossValue}
                    onChange={(event) => setGrossValue(event.target.value)}
                    placeholder="Ex.: 450000"
                    className="h-9"
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="text-muted-foreground mb-1 block text-xs font-medium">
                  Observação
                </span>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Contexto opcional ou justificativa obrigatória quando solicitada"
                  rows={3}
                />
              </label>
              {actionMessage ? (
                <p
                  role="status"
                  className={`rounded-lg border px-3 py-2 text-xs ${actionMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}
                >
                  {actionMessage.text}
                </p>
              ) : null}
              <Button
                className="w-full"
                onClick={registerFact}
                disabled={saving}
              >
                {saving ? 'Registrando...' : 'Confirmar fato'}
              </Button>
            </div>
          </section>

          <section className="border-border bg-card rounded-lg border p-4">
            <h3 className="text-foreground text-sm font-semibold">
              Próxima reunião
            </h3>
            {activeAppointment ? (
              <div className="mt-3">
                <div className="text-foreground flex items-center gap-2 text-sm">
                  <CalendarDays className="text-primary size-4" />{' '}
                  {formatDateTime(activeAppointment.starts_at)}
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  {activeAppointment.status === 'broker_confirmed'
                    ? 'Corretor confirmado'
                    : 'Aguardando confirmação do corretor'}
                </p>
                {activeAppointment.meeting_url ? (
                  <a
                    href={activeAppointment.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary mt-3 inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  >
                    Abrir reunião <ExternalLink className="size-3" />
                  </a>
                ) : null}
                {activeAppointment.status === 'broker_confirmed' &&
                new Date(activeAppointment.starts_at).getTime() <=
                  renderedAt ? (
                  <Button
                    className="mt-3 w-full"
                    onClick={() => setCallDialogOpen(true)}
                  >
                    <CheckCircle2 /> Call finalizada
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                Nenhuma reunião ativa para este lead.
              </p>
            )}
          </section>

          <section className="border-border bg-card rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-300" />
              <h3 className="text-foreground text-sm font-semibold">
                Próxima ação
              </h3>
            </div>
            <p className="text-muted-foreground mt-2 text-xs leading-5">
              {lead.next_action_at
                ? `Programada para ${formatDateTime(lead.next_action_at)}.`
                : lead.attention_state === 'no_action'
                  ? 'Aguardando o próximo fato da conversa.'
                  : 'Existe uma pendência na central de atenção.'}
            </p>
          </section>
        </aside>
      </div>

      <Dialog open={callDialogOpen} onOpenChange={setCallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar call</DialogTitle>
            <DialogDescription>
              Registre o resultado. O pipeline será atualizado e o chat será
              fechado para novas interações manuais.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1">
            <span className="text-xs font-medium">Status do lead</span>
            <select
              value={callOutcome}
              onChange={(event) => setCallOutcome(event.target.value)}
              className="border-input bg-background h-9 w-full rounded-lg border px-2 text-sm"
            >
              <option value="follow_up">Continuar acompanhamento</option>
              <option value="proposal_sent">Proposta enviada</option>
              <option value="negotiating">Em negociação</option>
              <option value="not_interested">Sem interesse</option>
            </select>
          </label>
          {callOutcome === 'not_interested' ? (
            <label className="space-y-1">
              <span className="text-xs font-medium">Motivo da perda</span>
              <select
                value={callReasonId}
                onChange={(event) => setCallReasonId(event.target.value)}
                className="border-input bg-background h-9 w-full rounded-lg border px-2 text-sm"
              >
                <option value="">Selecione...</option>
                {lossReasons.map((reason) => (
                  <option key={String(reason.id)} value={String(reason.id)}>
                    {String(reason.label)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="space-y-1">
            <span className="text-xs font-medium">Resumo da call</span>
            <Textarea
              value={callNotes}
              onChange={(event) => setCallNotes(event.target.value)}
              rows={4}
              placeholder="Interesse, objeções e próximo passo"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallDialogOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void completeCall()}>
              {saving ? 'Finalizando...' : 'Confirmar resultado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar call</DialogTitle>
            <DialogDescription>
              Escolha o responsável e confirme uma conversa de 10 a 15 minutos.
              O sistema impede conflitos e preserva 10 minutos de intervalo.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1">
            <span className="text-xs font-medium">Responsável</span>
            <select
              value={scheduleHostId}
              onChange={(event) => setScheduleHostId(event.target.value)}
              className="border-input bg-background h-9 w-full rounded-lg border px-2 text-sm"
            >
              <option value="">Selecione...</option>
              {(data.schedulingHosts ?? []).map((host) => (
                <option key={String(host.id)} value={String(host.id)}>
                  {String(host.full_name ?? host.email ?? 'Responsável')}
                  {String(host.id) === data.profileId ? ' (você)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium">Data e horário</span>
              <Input
                type="datetime-local"
                value={scheduleStartsAt}
                onChange={(event) => setScheduleStartsAt(event.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium">Duração</span>
              <select
                value={scheduleDuration}
                onChange={(event) => setScheduleDuration(event.target.value)}
                className="border-input bg-background h-9 w-full rounded-lg border px-2 text-sm"
              >
                <option value="10">10 minutos</option>
                <option value="15">15 minutos</option>
              </select>
            </label>
          </div>
          <label className="space-y-1">
            <span className="text-xs font-medium">Canal</span>
            <select
              value={scheduleChannel}
              onChange={(event) => setScheduleChannel(event.target.value)}
              className="border-input bg-background h-9 w-full rounded-lg border px-2 text-sm"
            >
              <option value="phone">Ligação</option>
              <option value="video">Vídeo</option>
              <option value="undefined">Definir depois</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Observação</span>
            <Textarea
              value={scheduleNotes}
              onChange={(event) => setScheduleNotes(event.target.value)}
              rows={3}
              placeholder="Contexto ou motivo de um encaixe excepcional"
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifyLead}
              onChange={(event) => setNotifyLead(event.target.checked)}
              className="mt-1"
            />
            <span>
              Enviar a confirmação ao lead pelo WhatsApp depois que a reserva
              for persistida.
            </span>
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void scheduleManualCall()}>
              {saving ? 'Agendando...' : 'Confirmar agendamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function readableValue(value: unknown) {
  if (value === null || value === undefined) return 'Não informado';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    if (object.unknown === true) return 'Não definido pelo lead';
    if ('min' in object || 'max' in object) {
      const min =
        object.min === null || object.min === undefined
          ? null
          : Number(object.min);
      const max =
        object.max === null || object.max === undefined
          ? null
          : Number(object.max);
      if (min === null && max !== null) return `Até ${formatCurrencyBRL(max)}`;
      if (max === null && min !== null)
        return `A partir de ${formatCurrencyBRL(min)}`;
      if (min === null || max === null) return 'Não informado';
      return min === max
        ? formatCurrencyBRL(min)
        : `${formatCurrencyBRL(min)} a ${formatCurrencyBRL(max)}`;
    }
    if (typeof object.label === 'string' && object.label.trim())
      return object.label;
    if (Array.isArray(object.values) && object.values.length)
      return object.values.map(String).join(', ');
    if (typeof object.text === 'string' && object.text.trim())
      return object.text;
  }
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return (
      Object.values(object)
        .filter((item) => item !== null && item !== '')
        .map(String)
        .join(' · ') || 'Registrado'
    );
  }
  return String(value);
}

function shouldShowRawAnswer(value: unknown, raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const canonical = readableValue(value).toLocaleLowerCase('pt-BR');
  const original = raw.trim().toLocaleLowerCase('pt-BR');
  return canonical !== original && !canonical.includes(original);
}

function CallBriefSection({ lead }: { lead: StudiospLead }) {
  const brief = lead.call_brief;
  const sections = [
    {
      title: 'Confirme estas informações',
      items: brief?.confirm ?? [],
    },
    {
      title: 'Explore durante a conversa',
      items: brief?.explore ?? [],
    },
    {
      title: 'Objeções já mencionadas',
      items: brief?.objections ?? [],
    },
    {
      title: 'Pontos orientativos',
      items: brief?.talking_points ?? [],
    },
  ];
  return (
    <section className="border-border bg-card rounded-lg border">
      <div className="border-border border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary size-4" />
          <h3 className="text-foreground text-sm font-semibold">
            Preparação orientativa da call
          </h3>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Síntese da IA baseada na conversa e nos dados confirmados. Valide as
          informações durante a call.
        </p>
      </div>
      <div className="space-y-4 p-4">
        <div className="border-primary/20 bg-primary/5 rounded-lg border p-3">
          <p className="text-muted-foreground text-[11px] font-medium uppercase">
            Como começar
          </p>
          <p className="text-foreground mt-1 text-sm leading-6">
            {brief?.opening ??
              lead.lead_summary ??
              'Retome o objetivo principal do lead e confirme o cenário antes de apresentar oportunidades.'}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {sections.map((section) => (
            <div
              key={section.title}
              className="border-border bg-muted/20 rounded-lg border p-3"
            >
              <h4 className="text-foreground text-xs font-semibold">
                {section.title}
              </h4>
              {section.items.length ? (
                <ul className="text-muted-foreground mt-2 space-y-1.5 text-xs leading-5">
                  {section.items.map((item, index) => (
                    <li
                      key={`${section.title}-${index}`}
                      className="flex gap-2"
                    >
                      <span className="text-primary">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-xs">
                  Nenhum ponto registrado até agora.
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="border-border rounded-lg border p-3">
          <p className="text-muted-foreground text-[11px] font-medium uppercase">
            Próximo resultado esperado
          </p>
          <p className="text-foreground mt-1 text-sm">
            {brief?.next_step ??
              'Confirmar aderência, esclarecer dúvidas e combinar o próximo passo comercial.'}
          </p>
        </div>
        {lead.call_brief_updated_at ? (
          <p className="text-muted-foreground text-right text-[10px]">
            Atualizado em {formatDateTime(lead.call_brief_updated_at)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function actorLabel(actor: string) {
  return actor === 'ai'
    ? 'IA'
    : actor === 'lead'
      ? 'Lead'
      : actor === 'user'
        ? 'Equipe'
        : actor === 'integration'
          ? 'Integração'
          : 'Sistema';
}
