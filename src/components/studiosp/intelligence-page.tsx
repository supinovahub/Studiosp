'use client';

import {
  Bot,
  Clock3,
  MessageSquareText,
  Plus,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import { formatDateTime } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

type Tab = 'behavior' | 'questions' | 'followups' | 'schedule' | 'runs';

export function IntelligencePage() {
  const { data, loading, error, reload } = useStudiospData('intelligence');
  const [tab, setTab] = useState<Tab>('behavior');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
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
    } catch (saveError) {
      setMessage({
        type: 'error',
        text:
          saveError instanceof Error
            ? saveError.message
            : 'Não foi possível salvar.',
      });
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
      <div className="border-border bg-card flex gap-1 overflow-x-auto rounded-lg border p-1">
        {(
          [
            ['behavior', 'Comportamento'],
            ['questions', 'Qualificação'],
            ['followups', 'Follow-ups'],
            ['schedule', 'Agendamento'],
            ['runs', 'Execuções'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-medium ${tab === value ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {message ? (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${message.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}
        >
          {message.text}
        </p>
      ) : null}
      {!canManage ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">
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
        <QuestionsPanel
          questions={data.questions ?? []}
          saving={saving}
          disabled={!canManage}
          onSave={(payload) =>
            save(
              'save_question',
              payload,
              payload.id
                ? 'Pergunta atualizada.'
                : 'Pergunta adicionada à qualificação.'
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
      {tab === 'runs' ? <RunsPanel runs={data.aiRuns ?? []} /> : null}
    </div>
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
    });
  }
  const tone =
    (config.tone_config as Record<string, unknown> | undefined) ?? {};
  return (
    <form onSubmit={submit} className="border-border bg-card rounded-lg border">
      <div className="border-border flex items-start gap-3 border-b p-4">
        <div className="border-primary/20 bg-primary/10 flex size-10 items-center justify-center rounded-lg border">
          <Bot className="text-primary size-5" />
        </div>
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            System prompt em camadas
          </h3>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            As políticas fixas impedem venda direta e ações perigosas; o texto
            abaixo personaliza identidade, tom e condução da conversa.
          </p>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <Field label="Nome da assistente">
          <Input
            name="identityName"
            defaultValue={String(config.identity_name ?? 'Assistente Studiosp')}
            disabled={disabled}
          />
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

function QuestionsPanel({
  questions,
  saving,
  disabled,
  onSave,
}: {
  questions: Record<string, unknown>[];
  saving: boolean;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      label: form.get('label'),
      promptInstruction: form.get('promptInstruction'),
      dataType: form.get('dataType'),
      isRequired: form.get('isRequired') === 'on',
      displayOrder: questions.length * 10 + 10,
    });
    event.currentTarget.reset();
  }
  return (
    <div className="space-y-4">
      <div className="border-border bg-card rounded-lg border">
        <div className="border-border border-b px-4 py-3">
          <h3 className="text-foreground text-sm font-semibold">
            Perguntas ativas
          </h3>
          <p className="text-muted-foreground text-xs">
            A IA pode fugir da sequência para responder o lead e depois retoma
            naturalmente.
          </p>
        </div>
        <div className="divide-border divide-y">
          {questions.map((question, index) => (
            <div
              key={String(question.id)}
              className="grid gap-3 px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
            >
              <span className="border-border bg-muted/50 text-muted-foreground flex size-7 items-center justify-center rounded-full border text-[10px] font-semibold">
                {index + 1}
              </span>
              <div>
                <p className="text-foreground text-sm font-medium">
                  {String(question.label)}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                  {String(question.prompt_instruction)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  compact
                  label={question.is_required ? 'Obrigatória' : 'Opcional'}
                  tone={question.is_required ? 'primary' : 'neutral'}
                />
                {!disabled ? (
                  <Switch
                    checked={question.is_active === true}
                    onCheckedChange={(checked) =>
                      onSave({
                        ...question,
                        id: question.id,
                        label: question.label,
                        promptInstruction: question.prompt_instruction,
                        dataType: question.data_type,
                        normalizationStrategy: question.normalization_strategy,
                        isRequired: question.is_required,
                        isActive: checked,
                        displayOrder: question.display_order,
                      })
                    }
                    aria-label={`${question.is_active ? 'Desativar' : 'Ativar'} ${String(question.label)}`}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      {!disabled ? (
        <form
          onSubmit={submit}
          className="border-primary/25 bg-primary/5 rounded-lg border p-4"
        >
          <h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <Plus className="text-primary size-4" /> Adicionar pergunta
            configurável
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Pergunta">
              <Input
                name="label"
                required
                placeholder="Ex.: Qual faixa de entrada fica confortável?"
              />
            </Field>
            <Field label="Tipo de resposta">
              <select
                name="dataType"
                className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
              >
                <option value="text">Texto livre</option>
                <option value="single_choice">Escolha única</option>
                <option value="money_range">Faixa de valor</option>
                <option value="location">Localização</option>
                <option value="boolean">Sim ou não</option>
              </select>
            </Field>
            <Field label="Como a IA deve perguntar" wide>
              <Textarea
                name="promptInstruction"
                rows={3}
                placeholder="Explique a intenção da pergunta, sem escrever um roteiro rígido."
              />
            </Field>
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                name="isRequired"
                type="checkbox"
                className="accent-primary size-4"
              />{' '}
              Obrigatória para concluir a qualificação
            </label>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Plus /> Adicionar
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
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
    <form onSubmit={submit} className="border-border bg-card rounded-lg border">
      <div className="border-border flex gap-3 border-b p-4">
        <div className="border-primary/20 bg-primary/10 flex size-10 items-center justify-center rounded-lg border">
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
    <form onSubmit={submit} className="border-border bg-card rounded-lg border">
      <div className="border-border flex gap-3 border-b p-4">
        <div className="border-primary/20 bg-primary/10 flex size-10 items-center justify-center rounded-lg border">
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
    <div className="border-border bg-card overflow-hidden rounded-lg border">
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
