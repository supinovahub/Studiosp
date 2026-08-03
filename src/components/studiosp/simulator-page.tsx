'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  ExternalLink,
  FlaskConical,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Send,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from './page-header';
import { StatusBadge } from './status-badge';

type Message = {
  id: string;
  sender_type: 'customer' | 'agent' | 'bot';
  content_text: string | null;
  created_at: string;
};
type Answer = {
  id: string;
  normalized_value: unknown;
  qualification_questions?: { key?: string; label?: string } | null;
};
interface SimulatorData {
  session: { id: string; opportunity_id: string; turn_count: number };
  messages: Message[];
  opportunity: {
    stage: string;
    qualification_status: string;
    meeting_status: string;
  };
  answers: Answer[];
  externalEffects: false;
}

const stages: Record<string, string> = {
  received: 'Recebido',
  contacting: 'Em contato',
  qualifying: 'Em qualificação',
  qualified: 'Qualificado',
  awaiting_schedule: 'Aguardando agenda',
  meeting_scheduled: 'Reunião agendada',
  meeting_completed: 'Reunião concluída',
  proposal_sent: 'Proposta enviada',
  negotiating: 'Em negociação',
  won: 'Ganho',
  lost: 'Perdido',
};

export function SimulatorPage() {
  const [data, setData] = useState<SimulatorData | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch('/api/studiosp/simulator', {
      cache: 'no-store',
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || 'Não foi possível carregar o simulador.');
    setData(body);
  }, []);

  useEffect(() => {
    void load()
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(
    () => endRef.current?.scrollIntoView({ behavior: 'smooth' }),
    [data?.messages.length]
  );

  async function sendMessage() {
    if (!message.trim() || sending) return;
    const pending = message.trim();
    setMessage('');
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/studiosp/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: pending }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || 'O Pedro não conseguiu responder.');
      setData(body);
    } catch (cause) {
      setMessage(pending);
      setError(
        cause instanceof Error ? cause.message : 'Falha ao executar o turno.'
      );
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    if (
      resetting ||
      !window.confirm('Apagar a conversa e a qualificação do lead de teste?')
    )
      return;
    setResetting(true);
    setError(null);
    try {
      const response = await fetch('/api/studiosp/simulator', {
        method: 'DELETE',
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível limpar o contexto.');
      setData(body);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Falha ao limpar o contexto.'
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ambiente isolado"
        title="Simulador do Pedro"
        description="Teste a qualificação e o pipeline reais sem campanha, WhatsApp ou notificações externas."
        actions={
          <div className="border-border bg-card text-muted-foreground flex items-center gap-2 rounded-full border px-3 py-2 text-xs">
            <LockKeyhole className="size-3.5" /> Sem efeitos externos
          </div>
        }
      />
      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-h-[38rem] overflow-hidden p-0">
          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Conversa simulada</h2>
              <p className="text-muted-foreground text-sm">
                Lead teste · {data?.session.turn_count ?? 0} turnos
              </p>
            </div>
            <div className="flex items-center gap-2">
              {data ? (
                <StatusBadge
                  label={
                    stages[data.opportunity.stage] ?? data.opportunity.stage
                  }
                  tone="primary"
                />
              ) : null}
              {data ? (
                <Link
                  href={`/leads/${data.session.opportunity_id}`}
                  className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium"
                >
                  Abrir lead <ExternalLink className="size-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
          <div className="flex h-[31rem] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {loading ? (
                <Centered>
                  <LoaderCircle className="size-4 animate-spin" /> Preparando
                  lead...
                </Centered>
              ) : data?.messages.length ? (
                data.messages.map((item) => {
                  const lead = item.sender_type === 'customer';
                  return (
                    <div
                      key={item.id}
                      className={`flex gap-2 ${lead ? 'justify-end' : 'justify-start'}`}
                    >
                      {!lead ? (
                        <Avatar>
                          <Bot className="size-4" />
                        </Avatar>
                      ) : null}
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${lead ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'}`}
                      >
                        {item.content_text}
                      </div>
                      {lead ? (
                        <Avatar>
                          <UserRound className="size-4" />
                        </Avatar>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <Centered>
                  <FlaskConical className="size-8" />
                  <div>
                    <p className="text-foreground font-medium">
                      Comece do zero
                    </p>
                    <p className="mt-1 text-sm">Escreva como um lead real.</p>
                  </div>
                </Centered>
              )}
              {sending ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <LoaderCircle className="size-4 animate-spin" /> Pedro está
                  processando...
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
            <div className="border-border border-t p-4">
              <div className="flex items-end gap-2">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="Digite a mensagem do lead..."
                  className="min-h-12 resize-none"
                  disabled={sending || loading}
                />
                <Button
                  onClick={() => void sendMessage()}
                  disabled={sending || !message.trim()}
                  className="h-12 w-12 p-0"
                  aria-label="Enviar mensagem simulada"
                >
                  {sending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="block p-5">
            <h2 className="text-base font-semibold">Estado operacional</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <State
                label="Pipeline"
                value={
                  data
                    ? (stages[data.opportunity.stage] ?? data.opportunity.stage)
                    : '—'
                }
              />
              <State
                label="Qualificação"
                value={data?.opportunity.qualification_status ?? '—'}
              />
              <State
                label="Reunião"
                value={data?.opportunity.meeting_status ?? '—'}
              />
              <State
                label="Campos capturados"
                value={String(data?.answers.length ?? 0)}
              />
            </dl>
          </Card>
          <Card className="block p-5">
            <h2 className="text-base font-semibold">Contexto capturado</h2>
            <div className="mt-4 space-y-3">
              {data?.answers.length ? (
                data.answers.map((answer) => (
                  <div
                    key={answer.id}
                    className="border-border border-b pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-muted-foreground text-xs">
                      {answer.qualification_questions?.label ??
                        answer.qualification_questions?.key ??
                        'Campo'}
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {formatValue(answer.normalized_value)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhuma resposta qualificada ainda.
                </p>
              )}
            </div>
          </Card>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void reset()}
            disabled={resetting || loading}
          >
            {resetting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Apagar contexto e recomeçar
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Somente o lead de simulação será restaurado.
          </p>
        </div>
      </div>
    </div>
  );
}

function Avatar({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-primary-soft text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
      {children}
    </div>
  );
}
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center gap-3 text-center text-sm">
      {children}
    </div>
  );
}
function State({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium capitalize">
        {value.replaceAll('_', ' ')}
      </dd>
    </div>
  );
}
function formatValue(value: unknown) {
  if (value && typeof value === 'object' && 'text' in value)
    return String((value as { text: unknown }).text);
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  return JSON.stringify(value);
}
