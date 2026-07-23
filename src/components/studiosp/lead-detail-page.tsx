'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
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
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import {
  eventLabels,
  formatCurrencyBRL,
  formatDateTime,
  labelFor,
  sourceLabels,
} from '@/lib/studiosp/labels';
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
  const [actionMessage, setActionMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
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

  return (
    <div className="space-y-5">
      <Link
        href="/leads"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
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

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="border-border bg-card rounded-lg border">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
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
            <div className="divide-border divide-y">
              {qualificationRows.map(({ question, answer }) => (
                <div
                  key={String(question.id)}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[0.9fr_1.1fr] sm:gap-4"
                >
                  <p className="text-muted-foreground text-xs font-medium">
                    {String(question.label)}
                  </p>
                  <div>
                    <p className="text-foreground text-sm">
                      {answer
                        ? readableValue(
                            answer.normalized_value,
                            answer.raw_text
                          )
                        : 'Ainda não respondida'}
                    </p>
                    {answer ? (
                      <p className="text-muted-foreground mt-0.5 text-[10px]">
                        Confiança:{' '}
                        {Math.round(Number(answer.confidence ?? 0) * 100)}% ·{' '}
                        {String(answer.status) === 'confirmed'
                          ? 'confirmada'
                          : 'provisória'}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="border-border bg-card rounded-lg border">
            <div className="border-border border-b px-4 py-3">
              <h3 className="text-foreground text-sm font-semibold">
                Empreendimentos compatíveis
              </h3>
              <p className="text-muted-foreground text-xs">
                Visível para a equipe; o lead recebe somente a quantidade de
                oportunidades encontradas
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
                      className="border-border bg-muted/20 rounded-lg border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="border-primary/20 bg-primary/10 flex size-9 items-center justify-center rounded-lg border">
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

          <section className="border-border bg-card rounded-lg border">
            <div className="border-border border-b px-4 py-3">
              <h3 className="text-foreground text-sm font-semibold">
                Histórico imutável
              </h3>
              <p className="text-muted-foreground text-xs">
                Linha do tempo de fatos da oportunidade
              </p>
            </div>
            {(data.events ?? []).length ? (
              <div className="divide-border divide-y">
                {(data.events ?? []).map((event) => (
                  <div key={String(event.id)} className="flex gap-3 px-4 py-3">
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
        </div>

        <aside className="space-y-4">
          <section className="border-primary/25 bg-primary/5 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="border-primary/25 bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg border">
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
    </div>
  );
}

function readableValue(value: unknown, raw: unknown) {
  if (raw && typeof raw === 'string') return raw;
  if (value === null || value === undefined) return 'Não informado';
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if ('label' in object) return String(object.label);
    if ('min' in object || 'max' in object)
      return `${formatCurrencyBRL(object.min as number)} a ${formatCurrencyBRL(object.max as number)}`;
    return (
      Object.values(object)
        .filter((item) => item !== null && item !== '')
        .map(String)
        .join(' · ') || 'Registrado'
    );
  }
  return String(value);
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
