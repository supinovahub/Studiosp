'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Info,
  MessageSquareText,
  Pause,
  Play,
  SendHorizontal,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import { formatDateTime } from '@/lib/studiosp/labels';
import type { StudiospAttention } from '@/lib/studiosp/types';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

type AttentionFilter = 'action' | 'recovering' | 'paused' | 'history';

const filterLabels: Record<AttentionFilter, string> = {
  action: 'Ação necessária',
  recovering: 'Em recuperação',
  paused: 'Conversas pausadas',
  history: 'Histórico',
};

export function AttentionPage() {
  const { data, loading, error, reload } = useStudiospData('attention');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AttentionFilter>('action');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [guidanceItem, setGuidanceItem] = useState<StudiospAttention | null>(
    null
  );
  const [guidance, setGuidance] = useState('');
  const [guidanceScope, setGuidanceScope] = useState<
    'reply' | 'conversation' | 'knowledge'
  >('reply');
  const [renderedAt] = useState(() => Date.now());

  const items = useMemo(() => data?.attention ?? [], [data?.attention]);
  const countByFilter = (key: AttentionFilter) =>
    items.filter((item) => attentionBucket(item) === key).length;
  const visibleItems = items.filter((item) => attentionBucket(item) === filter);

  if (loading) return <LoadingState label="Priorizando pendências..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;

  async function resolve(id: string) {
    setSavingId(id);
    setActionError(null);
    try {
      await runStudiospAction('resolve_attention', {
        attentionId: id,
        resolution: { outcome: 'resolved_from_attention_center' },
      });
      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Não foi possível resolver.'
      );
    } finally {
      setSavingId(null);
    }
  }

  async function provideGuidance() {
    const requestId = String(guidanceItem?.guidanceRequest?.id ?? '');
    const incidentId = String(
      guidanceItem?.incident?.id ?? guidanceItem?.context?.incident_id ?? ''
    );
    if (
      !guidanceItem ||
      (!requestId && !incidentId) ||
      guidance.trim().length < 3
    ) {
      setActionError('Escreva o contexto que o Pedro precisa para responder.');
      return;
    }
    setSavingId(guidanceItem.id);
    setActionError(null);
    try {
      await runStudiospAction('provide_ai_guidance', {
        requestId,
        incidentId,
        guidance: guidance.trim(),
        scope: guidanceScope,
      });
      setGuidanceItem(null);
      setGuidance('');
      setGuidanceScope('reply');
      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível orientar e retomar a conversa.'
      );
    } finally {
      setSavingId(null);
    }
  }

  async function continueWithPedro(item: StudiospAttention) {
    const conversationId = String(item.context?.conversation_id ?? '');
    if (!conversationId) return;
    setSavingId(item.id);
    setActionError(null);
    try {
      await runStudiospAction('continue_ai_conversation', {
        conversationId,
        incidentId: String(
          item.incident?.id ?? item.context?.incident_id ?? ''
        ),
      });
      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível continuar com o Pedro.'
      );
    } finally {
      setSavingId(null);
    }
  }

  async function keepPaused(item: StudiospAttention) {
    const conversationId = String(item.context?.conversation_id ?? '');
    if (!conversationId) return;
    setSavingId(item.id);
    setActionError(null);
    try {
      await runStudiospAction('pause_ai_conversation', {
        conversationId,
        incidentId: String(
          item.incident?.id ?? item.context?.incident_id ?? ''
        ),
      });
      setFilter('paused');
      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível manter a conversa pausada.'
      );
    } finally {
      setSavingId(null);
    }
  }

  async function archiveCase(item: StudiospAttention) {
    const conversationId = String(item.context?.conversation_id ?? '');
    if (!conversationId) return;
    setSavingId(item.id);
    setActionError(null);
    try {
      await runStudiospAction('archive_ai_case', {
        conversationId,
        attentionId: item.id,
        incidentId: String(
          item.incident?.id ?? item.context?.incident_id ?? ''
        ),
      });
      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Não foi possível arquivar.'
      );
    } finally {
      setSavingId(null);
    }
  }

  async function takeOver(item: StudiospAttention) {
    const conversationId = String(item.context?.conversation_id ?? '');
    if (!conversationId) return;
    setSavingId(item.id);
    setActionError(null);
    try {
      await runStudiospAction('take_over_ai_conversation', {
        conversationId,
      });
      window.location.assign(`/inbox?c=${conversationId}`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Não foi possível assumir.'
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decisão humana"
        title="Central de atenção"
        description="Exceções que precisam de contexto, decisão ou acompanhamento. Resolver uma pendência não altera fatos comerciais por conta própria."
      />

      <section
        aria-label="Resumo das pendências"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryCard
          label="Ação necessária"
          value={countByFilter('action')}
          detail="Precisam de uma decisão sua"
          icon={AlertTriangle}
          tone={countByFilter('action') ? 'warning' : 'success'}
        />
        <SummaryCard
          label="Em recuperação"
          value={countByFilter('recovering')}
          detail="Pedro já está retomando"
          icon={Sparkles}
          tone="primary"
        />
        <SummaryCard
          label="Pausadas"
          value={countByFilter('paused')}
          detail="Aguardam liberação ou humano"
          icon={Pause}
          tone={countByFilter('paused') ? 'neutral' : 'success'}
        />
        <SummaryCard
          label="Histórico"
          value={countByFilter('history')}
          detail="Casos concluídos e auditáveis"
          icon={Archive}
          tone="neutral"
        />
      </section>

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível concluir a ação</p>
            <p className="mt-0.5 text-xs text-red-400/85">{actionError}</p>
          </div>
        </div>
      ) : null}

      {items.length ? (
        <Card className="gap-0 py-0">
          <div className="border-border/65 flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                {filterLabels[filter]}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Um caso por conversa, com todo o histórico técnico preservado
              </p>
            </div>
            <div
              className="bg-muted/60 flex w-fit rounded-xl p-1"
              aria-label="Filtrar pendências"
            >
              {(Object.keys(filterLabels) as AttentionFilter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className={`min-h-8 rounded-lg px-3 text-xs font-medium transition-colors ${
                    filter === key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {filterLabels[key]} · {countByFilter(key)}
                </button>
              ))}
            </div>
          </div>

          {visibleItems.length ? (
            <div className="divide-border/60 divide-y">
              {visibleItems.map((item) => {
                const overdue =
                  item.due_at && new Date(item.due_at).getTime() < renderedAt;
                const isAiCase = [
                  'ai_needs_guidance',
                  'ai_operational_failure',
                  'ai_partial_reply',
                ].includes(item.kind);
                const deliveryUnsafe = ['ambiguous', 'partially_sent'].includes(
                  String(
                    item.incident?.delivery_state ??
                      item.context?.delivery_state ??
                      ''
                  )
                );
                const needsGuidance = item.kind === 'ai_needs_guidance';
                return (
                  <article
                    key={item.id}
                    className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <SeverityIcon severity={item.severity} />
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
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
                          <span
                            className={`text-tabular text-[11px] ${
                              overdue
                                ? 'font-semibold text-red-400'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {item.due_at
                              ? `${overdue ? 'Venceu' : 'Prazo'}: ${formatDateTime(item.due_at)}`
                              : 'Sem prazo definido'}
                          </span>
                        </div>
                        <h4 className="text-foreground text-sm font-semibold">
                          {item.title}
                        </h4>
                        <p className="text-muted-foreground mt-1 text-xs leading-5">
                          {item.lead?.contact?.name ??
                            item.lead?.contact?.phone ??
                            'Pendência geral da operação'}
                        </p>
                        {item.incident?.summary || item.context?.summary ? (
                          <p className="text-foreground/80 mt-1 max-w-2xl text-xs leading-5">
                            {String(
                              item.incident?.summary ?? item.context?.summary
                            )}
                          </p>
                        ) : null}
                        {['ambiguous', 'partially_sent'].includes(
                          String(
                            item.incident?.delivery_state ??
                              item.context?.delivery_state ??
                              ''
                          )
                        ) ? (
                          <p className="mt-1 text-xs font-medium text-red-400">
                            O envio pode ter chegado ao lead. Confira a conversa
                            antes de liberar outra tentativa.
                          </p>
                        ) : null}
                        {expandedId === item.id ? (
                          <IncidentTimeline item={item} />
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-11 lg:pl-0">
                      {isAiCase && filter === 'action' && needsGuidance ? (
                        <Button
                          onClick={() => {
                            setGuidanceItem(item);
                            setGuidance('');
                            setGuidanceScope('reply');
                          }}
                        >
                          <MessageSquareText />
                          Orientar o Pedro
                        </Button>
                      ) : null}
                      {isAiCase &&
                      !deliveryUnsafe &&
                      (filter === 'action' || filter === 'paused') &&
                      !needsGuidance ? (
                        <Button
                          onClick={() => void continueWithPedro(item)}
                          disabled={savingId === item.id}
                        >
                          <Play />
                          {savingId === item.id
                            ? 'Colocando na fila...'
                            : 'Continuar com Pedro'}
                        </Button>
                      ) : null}
                      {isAiCase && filter === 'action' ? (
                        <Button
                          variant="outline"
                          onClick={() => void keepPaused(item)}
                          disabled={savingId === item.id}
                        >
                          <Pause />
                          Manter Pedro pausado
                        </Button>
                      ) : null}
                      {item.context?.conversation_id ? (
                        <Button
                          variant={deliveryUnsafe ? 'default' : 'outline'}
                          render={
                            <Link
                              href={`/inbox?c=${String(item.context.conversation_id)}`}
                            />
                          }
                        >
                          Abrir conversa
                        </Button>
                      ) : null}
                      {isAiCase ? (
                        <Button
                          variant="outline"
                          onClick={() =>
                            setExpandedId((current) =>
                              current === item.id ? null : item.id
                            )
                          }
                          aria-expanded={expandedId === item.id}
                        >
                          <ChevronDown
                            className={
                              expandedId === item.id ? 'rotate-180' : ''
                            }
                          />
                          Detalhes
                        </Button>
                      ) : null}
                      {isAiCase && filter === 'paused' ? (
                        <Button
                          variant="outline"
                          onClick={() => void takeOver(item)}
                          disabled={savingId === item.id}
                        >
                          <UserRoundCheck />
                          Assumir conversa
                        </Button>
                      ) : null}
                      {isAiCase &&
                      (filter === 'action' || filter === 'paused') ? (
                        <Button
                          variant="ghost"
                          onClick={() => void archiveCase(item)}
                          disabled={savingId === item.id}
                        >
                          <Archive />
                          Arquivar caso
                        </Button>
                      ) : null}
                      {item.opportunity_id ? (
                        <Button
                          variant="outline"
                          render={
                            <Link href={`/leads/${item.opportunity_id}`} />
                          }
                        >
                          Abrir contexto
                        </Button>
                      ) : null}
                      {!isAiCase && filter !== 'history' ? (
                        <Button
                          variant="default"
                          onClick={() => resolve(item.id)}
                          disabled={savingId === item.id}
                        >
                          <Check />
                          {savingId === item.id
                            ? 'Salvando...'
                            : 'Marcar como resolvida'}
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={CheckCircle2}
                title={`Nenhuma pendência ${filterLabels[filter].toLowerCase()}`}
                description="Altere o filtro para consultar os demais itens da fila."
              />
            </div>
          )}
        </Card>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="A operação está em dia"
          description="Nenhuma decisão humana está pendente neste momento."
        />
      )}

      <GuidanceDialog
        item={guidanceItem}
        guidance={guidance}
        scope={guidanceScope}
        saving={Boolean(guidanceItem && savingId === guidanceItem.id)}
        onGuidanceChange={setGuidance}
        onScopeChange={setGuidanceScope}
        onOpenChange={(open) => {
          if (!open) setGuidanceItem(null);
        }}
        onSubmit={() => void provideGuidance()}
      />
    </div>
  );
}

function attentionBucket(item: StudiospAttention): AttentionFilter {
  if (['resolved', 'cancelled'].includes(item.status)) return 'history';
  const controlMode = String(item.conversationState?.ai_control_mode ?? '');
  const processingStatus = String(
    item.conversationState?.ai_processing_status ?? ''
  );
  const incidentStatus = String(item.incident?.status ?? '');
  const ownerAction = String(item.incident?.owner_action ?? '');
  if (ownerAction === 'pause' || controlMode === 'paused') return 'paused';
  if (
    incidentStatus === 'resolving' ||
    ['queued', 'processing', 'retrying'].includes(processingStatus)
  ) {
    return 'recovering';
  }
  return 'action';
}

function IncidentTimeline({ item }: { item: StudiospAttention }) {
  const events = item.incidentEvents ?? [];
  return (
    <div className="border-border/70 bg-muted/25 mt-3 rounded-xl border p-3">
      <p className="text-foreground text-xs font-semibold">
        Histórico técnico do caso
      </p>
      <p className="text-muted-foreground mt-1 text-[11px] leading-4">
        Os eventos ficam preservados para auditoria, mesmo quando o caso é
        arquivado.
      </p>
      <div className="mt-3 space-y-2">
        {events.length ? (
          events.map((event) => (
            <div
              key={String(event.id)}
              className="border-border/60 border-l-2 pl-3"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-foreground text-[11px] font-semibold">
                  {incidentReasonLabel(String(event.reason_code ?? 'falha'))}
                </span>
                <span className="text-muted-foreground text-tabular text-[10px]">
                  {formatDateTime(String(event.created_at))}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-[11px] leading-4">
                {String(event.summary ?? 'Evento registrado.')}
              </p>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-[11px]">
            Nenhum evento adicional foi registrado.
          </p>
        )}
      </div>
    </div>
  );
}

function incidentReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    ai_reply_delayed: 'Resposta atrasada',
    ambiguous_delivery: 'Envio sem confirmação',
    account_rate_limited: 'Limite temporário da conta',
    response_policy_blocked: 'Resposta bloqueada pela proteção',
    guidance_resume_failed: 'Retomada com orientação falhou',
  };
  return (
    labels[reason] ??
    reason
      .replace(/_/g, ' ')
      .replace(/^./, (letter) => letter.toLocaleUpperCase('pt-BR'))
  );
}

function GuidanceDialog({
  item,
  guidance,
  scope,
  saving,
  onGuidanceChange,
  onScopeChange,
  onOpenChange,
  onSubmit,
}: {
  item: StudiospAttention | null;
  guidance: string;
  scope: 'reply' | 'conversation' | 'knowledge';
  saving: boolean;
  onGuidanceChange: (value: string) => void;
  onScopeChange: (value: 'reply' | 'conversation' | 'knowledge') => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const request = item?.guidanceRequest;
  const messages = item?.conversationMessages ?? [];
  const scopeOptions = [
    {
      value: 'reply' as const,
      label: 'Só esta resposta',
      detail: 'Usa o contexto agora e não o reaproveita depois.',
    },
    {
      value: 'conversation' as const,
      label: 'Esta conversa',
      detail: 'Pedro lembra durante todo o atendimento deste lead.',
    },
    {
      value: 'knowledge' as const,
      label: 'Conhecimento da operação',
      detail: 'Pode ser reutilizado em conversas futuras da empresa.',
    },
  ];
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Orientar o Pedro e retomar o atendimento</DialogTitle>
          <DialogDescription>
            O Pedro continuará pausado até você fornecer uma orientação
            confiável. Depois disso, ele formulará e enviará a resposta pelo
            fluxo seguro.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section
            aria-label="Contexto recente da conversa"
            className="border-border/70 bg-muted/25 rounded-xl border p-3"
          >
            <p className="text-foreground text-xs font-semibold">
              Conversa recente
            </p>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {messages.length ? (
                messages.map((message) => {
                  const fromLead = message.sender_type === 'customer';
                  return (
                    <div
                      key={String(message.id)}
                      className={`flex ${fromLead ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-5 ${
                          fromLead
                            ? 'bg-card border-border/70 border'
                            : 'bg-primary-soft text-foreground'
                        }`}
                      >
                        <p className="mb-0.5 text-[10px] font-semibold tracking-wide uppercase opacity-65">
                          {fromLead ? 'Lead' : 'Pedro'}
                        </p>
                        <p className="whitespace-pre-wrap">
                          {String(
                            message.content_text ?? `[${message.content_type}]`
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-xs">
                  O histórico recente não ficou disponível. Abra a conversa
                  completa antes de orientar.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="border-warning/25 bg-warning-soft rounded-xl border p-3">
              <p className="text-foreground text-xs font-semibold">
                {item?.incident ? 'O que aconteceu' : 'O que está faltando'}
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                {String(
                  request?.missing_context_summary ??
                    item?.incident?.summary ??
                    item?.context?.summary ??
                    'Contexto confiável para continuar.'
                )}
              </p>
              {request?.lead_message_excerpt ||
              item?.context?.lead_message_excerpt ? (
                <p className="text-foreground mt-2 text-xs">
                  “
                  {String(
                    request?.lead_message_excerpt ??
                      item?.context?.lead_message_excerpt
                  )}
                  ”
                </p>
              ) : null}
            </div>

            <label className="block space-y-1.5">
              <span className="text-foreground text-xs font-semibold">
                Como o Pedro deve responder?
              </span>
              <Textarea
                value={guidance}
                onChange={(event) => onGuidanceChange(event.target.value)}
                rows={6}
                maxLength={4000}
                placeholder="Ex.: explique que atendemos apenas São Paulo capital e pergunte se ele considera bairros da zona sul."
              />
              <span className="text-muted-foreground block text-right text-[11px]">
                {guidance.length}/4000
              </span>
            </label>

            <fieldset>
              <legend className="text-foreground text-xs font-semibold">
                Onde guardar essa orientação?
              </legend>
              <div className="mt-2 space-y-2">
                {scopeOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                      scope === option.value
                        ? 'border-primary/45 bg-primary-soft'
                        : 'border-border/70 hover:bg-muted/45'
                    }`}
                  >
                    <input
                      type="radio"
                      name="guidance-scope"
                      value={option.value}
                      checked={scope === option.value}
                      onChange={() => onScopeChange(option.value)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-foreground block text-xs font-semibold">
                        {option.label}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-[11px] leading-4">
                        {option.detail}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Fechar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={saving || guidance.trim().length < 3}
          >
            <SendHorizontal />
            {saving ? 'Retomando...' : 'Enviar orientação e responder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Sparkles;
  tone: 'primary' | 'danger' | 'warning' | 'success' | 'neutral';
}) {
  const toneClasses = {
    primary: 'bg-primary-soft text-primary',
    danger: 'bg-red-500/10 text-red-400',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    neutral: 'bg-muted text-muted-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-4 py-4">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="text-foreground text-tabular text-xl font-semibold">
            {value}
          </p>
          <p className="text-muted-foreground truncate text-[11px]">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function SeverityIcon({
  severity,
}: {
  severity: 'critical' | 'warning' | 'info';
}) {
  const classes =
    severity === 'critical'
      ? 'bg-red-500/10 text-red-400'
      : severity === 'warning'
        ? 'bg-warning-soft text-warning'
        : 'bg-primary-soft text-primary';
  const Icon =
    severity === 'critical'
      ? AlertTriangle
      : severity === 'warning'
        ? Clock3
        : Info;
  return (
    <div
      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${classes}`}
    >
      <Icon className="size-4" />
    </div>
  );
}
