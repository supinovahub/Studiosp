'use client';

import {
  Bot,
  Clock3,
  MessageSquareText,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { AiConfig } from '@/components/settings/ai-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import { formatDateTime } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { ErrorState, LoadingState } from './operational-state';
import { QualificationInformationBuilder } from './qualification-information-builder';
import { StatusBadge } from './status-badge';

type Tab =
  | 'behavior'
  | 'questions'
  | 'followups'
  | 'schedule'
  | 'testing'
  | 'runs'
  | 'credentials';

export function IntelligencePage() {
  const { data, loading, error, reload } = useStudiospData('intelligence');
  const [tab, setTab] = useState<Tab>('behavior');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  useEffect(() => {
    if (window.location.hash !== '#credenciais') return;
    const frame = window.requestAnimationFrame(() => setTab('credentials'));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  if (loading)
    return <LoadingState label="Carregando inteligência da operação..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  const canManage = data.role === 'owner' || data.role === 'admin';

  async function save(
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
      return true;
    } catch (saveError) {
      setMessage({
        type: 'error',
        text:
          saveError instanceof Error
            ? saveError.message
            : 'Não foi possível salvar.',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuração da IA-SDR"
        title="Inteligência da operação"
        description="O dono define comportamento, perguntas, cadência e regras de agenda. Esses dados ficam versionados no banco e formam o contexto que a IA consulta em cada atendimento."
      />
      <div className="border-border/70 bg-card/80 sticky top-[4.5rem] z-10 flex gap-1 overflow-x-auto rounded-xl border p-1 shadow-sm backdrop-blur-md">
        {(
          [
            ['behavior', 'Comportamento'],
            ['questions', 'Qualificação'],
            ['followups', 'Follow-ups'],
            ['schedule', 'Agendamento'],
            ['testing', 'Testes da IA'],
            ['runs', 'Execuções'],
            ['credentials', 'Credenciais'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${tab === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {message ? (
        <p
          role="status"
          className={`rounded-xl border px-3 py-2.5 text-sm ${message.type === 'success' ? 'border-success/25 bg-success-soft text-success' : 'border-red-500/25 bg-red-500/10 text-red-400'}`}
        >
          {message.text}
        </p>
      ) : null}
      {!canManage ? (
        <p className="border-warning/20 bg-warning-soft text-warning rounded-xl border px-3 py-2.5 text-sm">
          Esta área é somente leitura para o seu perfil.
        </p>
      ) : null}

      {tab === 'behavior' ? (
        <BehaviorForm
          config={data.aiConfig ?? {}}
          saving={saving}
          disabled={!canManage}
          onSave={(payload) =>
            save('save_ai_config', payload, 'Comportamento da IA atualizado.')
          }
        />
      ) : null}
      {tab === 'questions' ? (
        <QualificationInformationBuilder
          questions={data.questions ?? []}
          questionOptions={data.questionOptions ?? []}
          saving={saving}
          disabled={!canManage}
          onSave={(payload) =>
            save(
              'save_question',
              payload,
              payload.id
                ? 'Informação atualizada.'
                : 'Informação adicionada à qualificação.'
            )
          }
          onReorder={(questionIds) =>
            save(
              'reorder_qualification_questions',
              { questionIds },
              'Ordem da qualificação atualizada.'
            )
          }
        />
      ) : null}
      {tab === 'followups' ? (
        <FollowupForm
          policy={data.followupPolicies?.[0] ?? {}}
          saving={saving}
          disabled={!canManage}
          onSave={(payload) =>
            save(
              'save_followup_policy',
              payload,
              'Cadência de follow-up atualizada.'
            )
          }
        />
      ) : null}
      {tab === 'schedule' ? (
        <ScheduleForm
          policy={data.schedulingPolicy ?? {}}
          saving={saving}
          disabled={!canManage}
          onSave={(payload) =>
            save(
              'save_scheduling_policy',
              payload,
              'Política de agendamento atualizada.'
            )
          }
        />
      ) : null}
      {tab === 'testing' ? (
        <AiTestingForm
          numbers={(data.aiReplyAllowedNumbers ?? []).map(String)}
          saving={saving}
          disabled={!canManage}
          onSave={(payload) =>
            save(
              'save_ai_reply_allowlist',
              payload,
              'Whitelist de testes atualizada.'
            )
          }
        />
      ) : null}
      {tab === 'runs' ? <RunsPanel runs={data.aiRuns ?? []} /> : null}
      {tab === 'credentials' ? <AiConfig /> : null}
    </div>
  );
}

function AiTestingForm({
  numbers,
  saving,
  disabled,
  onSave,
}: {
  numbers: string[];
  saving: boolean;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      numbers: String(form.get('numbers') ?? '')
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    });
  }

  return (
    <form
      onSubmit={submit}
      className="border-border/70 bg-card overflow-hidden rounded-2xl border"
    >
      <div className="border-border flex items-start gap-3 border-b p-4">
        <div className="border-primary/20 bg-primary-soft flex size-10 items-center justify-center rounded-xl border">
          <ShieldCheck className="text-primary size-5" />
        </div>
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            Whitelist de respostas da IA
          </h3>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            Durante a homologação, somente estes números podem acionar respostas
            automáticas. As demais mensagens continuam visíveis no Inbox.
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <Field label="Números autorizados, um por linha">
          <Textarea
            name="numbers"
            rows={6}
            defaultValue={numbers.join('\n')}
            placeholder={'+5527981168321\n+5527998303052'}
            disabled={disabled}
          />
        </Field>
        <p className="text-muted-foreground text-xs">
          Use DDI e DDD. Lista vazia libera todos os leads elegíveis.
        </p>
        {!disabled ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              <Save /> {saving ? 'Salvando...' : 'Salvar whitelist'}
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
}

function BehaviorForm({
  config,
  saving,
  disabled,
  onSave,
}: {
  config: Record<string, unknown>;
  saving: boolean;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: config.id,
      identityName: form.get('identityName'),
      communicationPrompt: form.get('communicationPrompt'),
      completionMessage: form.get('completionMessage'),
      tone: form.get('tone'),
      messageLength: form.get('messageLength'),
      adaptToLead: form.get('adaptToLead') === 'on',
      allowContextualLaughter: form.get('allowContextualLaughter') === 'on',
    });
  }
  const tone =
    (config.tone_config as Record<string, unknown> | undefined) ?? {};
  return (
    <form
      onSubmit={submit}
      className="border-border/70 bg-card overflow-hidden rounded-2xl border"
    >
      <div className="border-border flex items-start gap-3 border-b p-4">
        <div className="border-primary/20 bg-primary-soft flex size-10 items-center justify-center rounded-xl border">
          <Bot className="text-primary size-5" />
        </div>
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            System prompt em camadas
          </h3>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            As políticas fixas impedem venda direta e ações perigosas; o texto
            abaixo personaliza tom e condução sem alterar a identidade
            operacional do Pedro.
          </p>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <Field label="Identidade operacional">
          <Input name="identityName" value="Pedro" disabled readOnly />
        </Field>
        <Field label="Tom">
          <select
            name="tone"
            defaultValue={String(tone.style ?? 'consultivo')}
            disabled={disabled}
            className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
          >
            <option value="consultivo">Consultivo</option>
            <option value="direto">Direto</option>
            <option value="acolhedor">Acolhedor</option>
          </select>
        </Field>
        <Field label="Tamanho das mensagens">
          <select
            name="messageLength"
            defaultValue={String(tone.message_length ?? 'short')}
            disabled={disabled}
            className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
          >
            <option value="short">Curtas</option>
            <option value="medium">Médias</option>
          </select>
        </Field>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3">
          <ShieldCheck className="size-4 text-emerald-300" />
          <p className="text-muted-foreground text-xs">
            Não vende, não promete unidade e não confirma fatos humanos.
          </p>
        </div>
        <label className="border-border bg-background flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="text-foreground block text-sm font-medium">
              Adaptar ao jeito do lead
            </span>
            <span className="text-muted-foreground mt-1 block text-xs leading-5">
              Ajusta vocabulário e informalidade sem copiar erros ou perder
              clareza.
            </span>
          </span>
          <input
            type="checkbox"
            name="adaptToLead"
            defaultChecked={tone.adapt_to_lead !== false}
            disabled={disabled}
            className="accent-primary mt-0.5 size-4 shrink-0"
          />
        </label>
        <label className="border-border bg-background flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="text-foreground block text-sm font-medium">
              Acompanhar humor com moderação
            </span>
            <span className="text-muted-foreground mt-1 block text-xs leading-5">
              Permite “kkk”, “rs” ou emoji apenas quando o próprio lead já
              estiver nesse clima.
            </span>
          </span>
          <input
            type="checkbox"
            name="allowContextualLaughter"
            defaultChecked={tone.allow_contextual_laughter !== false}
            disabled={disabled}
            className="accent-primary mt-0.5 size-4 shrink-0"
          />
        </label>
        <Field label="Instruções de comunicação" wide>
          <Textarea
            name="communicationPrompt"
            rows={8}
            defaultValue={String(config.communication_prompt ?? '')}
            disabled={disabled}
          />
        </Field>
        <Field label="Mensagem ao concluir a qualificação" wide>
          <Textarea
            name="completionMessage"
            rows={3}
            defaultValue={String(config.completion_message ?? '')}
            disabled={disabled}
          />
        </Field>
        {!disabled ? (
          <div className="flex justify-end md:col-span-2">
            <Button type="submit" disabled={saving}>
              <Save /> {saving ? 'Salvando...' : 'Salvar comportamento'}
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
}

function FollowupForm({ policy, saving, disabled, onSave }: ConfigFormProps) {
  const steps = Array.isArray(policy.steps)
    ? (policy.steps as Record<string, unknown>[])
    : [];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hours = String(form.get('stepHours') ?? '')
      .split(',')
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);
    onSave({
      name: form.get('name'),
      windowStart: form.get('windowStart'),
      windowEnd: form.get('windowEnd'),
      steps: hours.map((hour) => ({ after_minutes: hour * 60 })),
    });
  }
  return (
    <form
      onSubmit={submit}
      className="border-border/70 bg-card overflow-hidden rounded-2xl border"
    >
      <div className="border-border flex gap-3 border-b p-4">
        <div className="border-primary/20 bg-primary-soft flex size-10 items-center justify-center rounded-xl border">
          <MessageSquareText className="text-primary size-5" />
        </div>
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            Cadência quando o lead não responde
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Qualquer nova mensagem cancela os próximos passos pendentes.
          </p>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <Field label="Nome">
          <Input
            name="name"
            defaultValue={String(policy.name ?? 'Cadência padrão')}
            disabled={disabled}
          />
        </Field>
        <Field label="Intervalos em horas, separados por vírgula">
          <Input
            name="stepHours"
            defaultValue={steps
              .map((step) => Number(step.after_minutes) / 60)
              .join(', ')}
            disabled={disabled}
          />
        </Field>
        <Field label="Início da janela">
          <Input
            name="windowStart"
            type="time"
            defaultValue={String(policy.window_start ?? '09:00').slice(0, 5)}
            disabled={disabled}
          />
        </Field>
        <Field label="Fim da janela">
          <Input
            name="windowEnd"
            type="time"
            defaultValue={String(policy.window_end ?? '20:00').slice(0, 5)}
            disabled={disabled}
          />
        </Field>
        {!disabled ? (
          <div className="flex justify-end md:col-span-2">
            <Button type="submit" disabled={saving}>
              <Save /> Salvar cadência
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
}

function ScheduleForm({ policy, saving, disabled, onSave }: ConfigFormProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave(Object.fromEntries(form.entries()));
  }
  return (
    <form
      onSubmit={submit}
      className="border-border/70 bg-card overflow-hidden rounded-2xl border"
    >
      <div className="border-border flex gap-3 border-b p-4">
        <div className="border-primary/20 bg-primary-soft flex size-10 items-center justify-center rounded-xl border">
          <Clock3 className="text-primary size-5" />
        </div>
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            Política de horário garantido
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Define o que a IA pode reservar sem deixar o lead esperando.
          </p>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-3">
        <NumberField
          label="Duração da call (min)"
          name="meetingDuration"
          value={policy.meeting_duration_minutes ?? 10}
          disabled={disabled}
          min={5}
        />
        <NumberField
          label="Intervalo entre calls (min)"
          name="bufferMinutes"
          value={policy.buffer_minutes ?? 5}
          disabled={disabled}
          min={0}
        />
        <NumberField
          label="Antecedência mínima (min)"
          name="minimumNotice"
          value={policy.minimum_notice_minutes ?? 120}
          disabled={disabled}
          min={0}
        />
        <NumberField
          label="Horizonte de agenda (dias)"
          name="horizonDays"
          value={policy.scheduling_horizon_days ?? 7}
          disabled={disabled}
          min={1}
        />
        <NumberField
          label="Prazo de aceite do corretor (min)"
          name="brokerSla"
          value={policy.broker_offer_sla_minutes ?? 15}
          disabled={disabled}
          min={1}
        />
        <NumberField
          label="Cancelar antes da reunião (min)"
          name="cancellationCutoff"
          value={policy.lead_cancellation_cutoff_minutes ?? 180}
          disabled={disabled}
          min={0}
        />
        <input
          type="hidden"
          name="brokerReminder"
          value={String(policy.broker_reminder_minutes ?? 15)}
        />
        <input
          type="hidden"
          name="routingStrategy"
          value={String(policy.routing_strategy ?? 'round_robin')}
        />
        {!disabled ? (
          <div className="flex justify-end md:col-span-3">
            <Button type="submit" disabled={saving}>
              <Save /> Salvar política
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
}

function RunsPanel({ runs }: { runs: Record<string, unknown>[] }) {
  return (
    <div className="border-border/70 bg-card overflow-hidden rounded-2xl border">
      <div className="border-border border-b px-4 py-3">
        <h3 className="text-foreground text-sm font-semibold">
          Execuções recentes da IA
        </h3>
        <p className="text-muted-foreground text-xs">
          Rastreabilidade de status, modelo, latência e falhas sanitizadas
        </p>
      </div>
      {runs.length ? (
        <div className="divide-border divide-y">
          {runs.map((run) => (
            <div
              key={String(run.id)}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
            >
              <div>
                <p className="text-foreground text-sm font-medium">
                  {String(run.purpose).replaceAll('_', ' ')}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {formatDateTime(String(run.created_at))}
                </p>
              </div>
              <p className="text-muted-foreground text-xs">
                {String(run.provider ?? 'provedor')} ·{' '}
                {String(run.model ?? 'modelo')}
              </p>
              <p className="text-muted-foreground text-xs">
                {run.latency_ms
                  ? `${String(run.latency_ms)} ms`
                  : 'Sem latência'}
              </p>
              <StatusBadge
                compact
                label={
                  String(run.status) === 'completed'
                    ? 'Concluída'
                    : String(run.status) === 'failed'
                      ? 'Falhou'
                      : String(run.status)
                }
                tone={
                  String(run.status) === 'completed'
                    ? 'success'
                    : String(run.status) === 'failed'
                      ? 'danger'
                      : 'warning'
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground p-6 text-center text-sm">
          Nenhuma execução registrada.
        </p>
      )}
    </div>
  );
}

interface ConfigFormProps {
  policy: Record<string, unknown>;
  saving: boolean;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'block md:col-span-2' : 'block'}>
      <span className="text-muted-foreground mb-1 block text-xs font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}
function NumberField({
  label,
  name,
  value,
  disabled,
  min,
}: {
  label: string;
  name: string;
  value: unknown;
  disabled: boolean;
  min: number;
}) {
  return (
    <Field label={label}>
      <Input
        name={name}
        type="number"
        min={min}
        defaultValue={String(value)}
        disabled={disabled}
      />
    </Field>
  );
}
