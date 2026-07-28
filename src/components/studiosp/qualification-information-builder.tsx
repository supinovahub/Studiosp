'use client';

import {
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  LockKeyhole,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  QUALIFICATION_DATA_TYPES,
  type QualificationDataType,
} from '@/lib/ai/qualification-question-config';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from './status-badge';

type Row = Record<string, unknown>;

interface OptionDraft {
  id?: string;
  value?: string;
  label: string;
  aliases: string;
}

interface QuestionDraft {
  id?: string;
  key?: string;
  isSystem: boolean;
  label: string;
  promptInstruction: string;
  dataType: QualificationDataType;
  isRequired: boolean;
  isActive: boolean;
  displayOrder: number;
  questionExample: string;
  answerExamples: string;
  clarificationGuidance: string;
  allowUnknown: boolean;
  minimum: string;
  maximum: string;
  visibilityMode: 'always' | 'conditional';
  visibilityQuestionKey: string;
  visibilityOperator: 'answered' | 'not_answered' | 'equals' | 'includes_any';
  visibilityValues: string;
  options: OptionDraft[];
}

const EMPTY_DRAFT: QuestionDraft = {
  isSystem: false,
  label: '',
  promptInstruction: '',
  dataType: 'text',
  isRequired: false,
  isActive: true,
  displayOrder: 100,
  questionExample: '',
  answerExamples: '',
  clarificationGuidance: '',
  allowUnknown: false,
  minimum: '',
  maximum: '',
  visibilityMode: 'always',
  visibilityQuestionKey: '',
  visibilityOperator: 'answered',
  visibilityValues: '',
  options: [],
};

function objectValue(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function typeLabel(value: unknown) {
  return (
    QUALIFICATION_DATA_TYPES.find((type) => type.value === value)?.label ??
    'Resposta estruturada'
  );
}

function draftFromQuestion(question: Row, questionOptions: Row[]) {
  const validation = objectValue(question.validation_schema);
  const visibility = objectValue(question.visibility_condition);
  return {
    id: String(question.id),
    key: String(question.key),
    isSystem: question.is_system === true,
    label: String(question.label ?? ''),
    promptInstruction: String(question.prompt_instruction ?? ''),
    dataType: String(question.data_type ?? 'text') as QualificationDataType,
    isRequired: question.is_required === true,
    isActive: question.is_active !== false,
    displayOrder: Number(question.display_order ?? 100),
    questionExample: String(validation.question_example ?? ''),
    answerExamples: stringList(validation.examples).join('\n'),
    clarificationGuidance: String(validation.clarification_guidance ?? ''),
    allowUnknown: validation.allow_unknown === true,
    minimum:
      typeof validation.minimum === 'number' ? String(validation.minimum) : '',
    maximum:
      typeof validation.maximum === 'number' ? String(validation.maximum) : '',
    visibilityMode:
      visibility.mode === 'answer_matches'
        ? ('conditional' as const)
        : ('always' as const),
    visibilityQuestionKey: String(visibility.question_key ?? ''),
    visibilityOperator: String(
      visibility.operator ?? 'answered'
    ) as QuestionDraft['visibilityOperator'],
    visibilityValues: stringList(visibility.values).join(', '),
    options: questionOptions
      .filter(
        (option) =>
          option.question_id === question.id && option.is_active !== false
      )
      .sort(
        (left, right) =>
          Number(left.display_order ?? 0) - Number(right.display_order ?? 0)
      )
      .map((option) => ({
        id: String(option.id),
        value: String(option.value),
        label: String(option.label),
        aliases: stringList(option.aliases).join(', '),
      })),
  };
}

function payloadFromDraft(draft: QuestionDraft) {
  const validationSchema: Record<string, unknown> = {
    allow_unknown: draft.allowUnknown,
    question_example: draft.questionExample,
    clarification_guidance: draft.clarificationGuidance,
    examples: draft.answerExamples
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean),
  };
  if (draft.minimum.trim()) validationSchema.minimum = Number(draft.minimum);
  if (draft.maximum.trim()) validationSchema.maximum = Number(draft.maximum);
  if (draft.dataType === 'money_range') validationSchema.currency = 'BRL';

  return {
    ...(draft.id ? { id: draft.id } : {}),
    label: draft.label,
    promptInstruction: draft.promptInstruction,
    dataType: draft.dataType,
    isRequired: draft.isRequired,
    isActive: draft.isActive,
    displayOrder: draft.displayOrder,
    validationSchema,
    visibilityCondition:
      draft.visibilityMode === 'conditional'
        ? {
            mode: 'answer_matches',
            question_key: draft.visibilityQuestionKey,
            operator: draft.visibilityOperator,
            values: draft.visibilityValues
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : { mode: 'always' },
    options: draft.options.map((option) => ({
      ...(option.id ? { id: option.id } : {}),
      ...(option.value ? { value: option.value } : {}),
      label: option.label,
      aliases: option.aliases
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    })),
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-foreground text-sm font-medium">{label}</span>
      {hint ? (
        <span className="text-muted-foreground text-xs leading-5">{hint}</span>
      ) : null}
      {children}
    </label>
  );
}

export function QualificationInformationBuilder({
  questions,
  questionOptions,
  saving,
  disabled,
  onSave,
  onReorder,
}: {
  questions: Row[];
  questionOptions: Row[];
  saving: boolean;
  disabled: boolean;
  onSave: (payload: Row) => Promise<boolean>;
  onReorder: (questionIds: string[]) => Promise<boolean>;
}) {
  const orderedQuestions = useMemo(
    () =>
      [...questions].sort(
        (left, right) =>
          Number(left.display_order ?? 0) - Number(right.display_order ?? 0)
      ),
    [questions]
  );
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const activeCount = orderedQuestions.filter(
    (question) => question.is_active !== false
  ).length;
  const essentialCount = orderedQuestions.filter(
    (question) => question.is_system === true
  ).length;
  const customRequiredCount = orderedQuestions.filter(
    (question) =>
      question.is_system !== true &&
      question.is_required === true &&
      question.is_active !== false
  ).length;

  function openNew() {
    const lastOrder = Math.max(
      0,
      ...orderedQuestions.map((question) => Number(question.display_order ?? 0))
    );
    setDraft({ ...EMPTY_DRAFT, displayOrder: lastOrder + 10 });
  }

  function openEdit(question: Row) {
    setDraft(draftFromQuestion(question, questionOptions));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const saved = await onSave(payloadFromDraft(draft));
    if (saved) setDraft(null);
  }

  async function toggleQuestion(question: Row, checked: boolean) {
    const nextDraft = draftFromQuestion(question, questionOptions);
    await onSave(payloadFromDraft({ ...nextDraft, isActive: checked }));
  }

  async function moveQuestion(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= orderedQuestions.length) return;
    const next = orderedQuestions.map((question) => String(question.id));
    [next[index], next[destination]] = [next[destination], next[index]];
    await onReorder(next);
  }

  const previousQuestions = draft
    ? orderedQuestions.filter(
        (question) =>
          question.id !== draft.id &&
          Number(question.display_order ?? 0) < draft.displayOrder
      )
    : [];
  const choiceType =
    draft && ['single_choice', 'multi_choice'].includes(draft.dataType);
  const selectedDependency = draft
    ? previousQuestions.find(
        (question) => question.key === draft.visibilityQuestionKey
      )
    : null;
  const selectedDependencyOptions = selectedDependency
    ? questionOptions.filter(
        (option) =>
          option.question_id === selectedDependency.id &&
          option.is_active !== false
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border-border/70 bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs font-medium">
            Informações ativas
          </p>
          <p className="text-foreground mt-2 text-2xl font-semibold">
            {activeCount}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            A IA coleta apenas o que estiver aplicável.
          </p>
        </div>
        <div className="border-border/70 bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs font-medium">
            Objetivos essenciais
          </p>
          <p className="text-foreground mt-2 text-2xl font-semibold">
            {essentialCount}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Protegidos para preservar o fluxo da operação.
          </p>
        </div>
        <div className="border-border/70 bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs font-medium">
            Regras adicionais obrigatórias
          </p>
          <p className="text-foreground mt-2 text-2xl font-semibold">
            {customRequiredCount}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Cada uma pode prolongar a qualificação.
          </p>
        </div>
      </div>

      <div className="border-primary/20 bg-primary/5 flex gap-3 rounded-2xl border p-4">
        <BrainCircuit className="text-primary mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-foreground text-sm font-semibold">
            Você define o que descobrir. A IA decide como conversar.
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            O nome é interno. O objetivo, os exemplos e a orientação ajudam a
            interpretar respostas, mas não viram um roteiro rígido no WhatsApp.
          </p>
        </div>
      </div>

      <div className="border-border/70 bg-card overflow-hidden rounded-2xl border">
        <div className="border-border flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              Jornada de qualificação
            </h3>
            <p className="text-muted-foreground mt-1 text-xs">
              A ordem orienta a conversa; desvios úteis continuam permitidos.
            </p>
          </div>
          {!disabled ? (
            <Button type="button" onClick={openNew}>
              <Plus /> Adicionar informação
            </Button>
          ) : null}
        </div>

        <div className="divide-border divide-y">
          {orderedQuestions.map((question, index) => {
            const isSystem = question.is_system === true;
            const isActive = question.is_active !== false;
            const visibility = objectValue(question.visibility_condition);
            return (
              <div
                key={String(question.id)}
                className={`grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start ${isActive ? '' : 'opacity-60'}`}
              >
                <div className="flex items-center gap-1">
                  {!disabled ? (
                    <div className="flex flex-col">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={saving || index === 0}
                        onClick={() => moveQuestion(index, -1)}
                        aria-label={`Mover ${String(question.label)} para cima`}
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={
                          saving || index === orderedQuestions.length - 1
                        }
                        onClick={() => moveQuestion(index, 1)}
                        aria-label={`Mover ${String(question.label)} para baixo`}
                      >
                        <ChevronDown />
                      </Button>
                    </div>
                  ) : null}
                  <span className="border-border bg-muted/50 text-muted-foreground flex size-8 items-center justify-center rounded-full border text-xs font-semibold">
                    {index + 1}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-foreground text-sm font-semibold">
                      {String(question.label)}
                    </p>
                    <StatusBadge
                      compact
                      label={isSystem ? 'Essencial' : 'Personalizada'}
                      tone={isSystem ? 'primary' : 'neutral'}
                    />
                    <StatusBadge
                      compact
                      label={
                        question.is_required ? 'Obrigatória' : 'Complementar'
                      }
                      tone={question.is_required ? 'warning' : 'neutral'}
                    />
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {String(question.prompt_instruction)}
                  </p>
                  <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span>{typeLabel(question.data_type)}</span>
                    <span>
                      {visibility.mode === 'answer_matches'
                        ? 'Usada somente quando a condição for atendida'
                        : 'Sempre aplicável'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {isSystem ? (
                    <span
                      className="text-muted-foreground inline-flex items-center gap-1 text-[11px]"
                      title="Objetivo essencial protegido"
                    >
                      <LockKeyhole className="size-3.5" /> Protegida
                    </span>
                  ) : !disabled ? (
                    <Switch
                      checked={isActive}
                      disabled={saving}
                      onCheckedChange={(checked) =>
                        toggleQuestion(question, checked)
                      }
                      aria-label={`${isActive ? 'Desativar' : 'Ativar'} ${String(question.label)}`}
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(question)}
                  >
                    <Pencil /> {disabled ? 'Ver' : 'Editar'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open && !saving) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-3xl">
          {draft ? (
            <form
              onSubmit={submit}
              className="flex max-h-[92vh] min-h-0 flex-col"
            >
              <DialogHeader className="border-border border-b px-5 py-4 pr-12">
                <DialogTitle>
                  {draft.id ? 'Configurar informação' : 'Adicionar informação'}
                </DialogTitle>
                <DialogDescription>
                  Configure a intenção e os limites. A formulação final se
                  adapta ao contexto de cada conversa.
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
                <section className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="bg-primary-soft text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Sparkles className="size-4" />
                    </span>
                    <div>
                      <h4 className="text-foreground text-sm font-semibold">
                        O que a IA precisa descobrir
                      </h4>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Descreva a informação, não um script de atendimento.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Nome interno"
                      hint="Aparece no painel e no resumo do lead."
                    >
                      <Input
                        value={draft.label}
                        required
                        minLength={3}
                        maxLength={120}
                        disabled={disabled}
                        placeholder="Ex.: Motivo da mudança"
                        onChange={(event) =>
                          setDraft({ ...draft, label: event.target.value })
                        }
                      />
                    </Field>
                    <Field
                      label="Tipo de resposta"
                      hint={
                        draft.isSystem
                          ? 'Protegido neste objetivo essencial.'
                          : 'Define como a resposta será normalizada.'
                      }
                    >
                      <select
                        value={draft.dataType}
                        disabled={disabled || draft.isSystem}
                        onChange={(event) => {
                          const dataType = event.target
                            .value as QualificationDataType;
                          setDraft({
                            ...draft,
                            dataType,
                            options: ['single_choice', 'multi_choice'].includes(
                              dataType
                            )
                              ? draft.options.length
                                ? draft.options
                                : [
                                    { label: '', aliases: '' },
                                    { label: '', aliases: '' },
                                  ]
                              : [],
                          });
                        }}
                        className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm disabled:opacity-60"
                      >
                        {QUALIFICATION_DATA_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field
                    label="Objetivo para a IA"
                    hint="Explique o que deve ficar claro e por que isso é útil. A IA cria a pergunta adequada ao momento."
                  >
                    <Textarea
                      value={draft.promptInstruction}
                      required
                      minLength={12}
                      maxLength={800}
                      rows={4}
                      disabled={disabled}
                      placeholder="Ex.: Entenda o que motivou a busca e se existe algum evento que esteja acelerando a decisão."
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          promptInstruction: event.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field
                    label="Exemplo de pergunta"
                    hint="Opcional. Serve como referência e como resposta segura em contingências; não será repetido mecanicamente."
                  >
                    <Input
                      value={draft.questionExample}
                      maxLength={240}
                      disabled={disabled}
                      placeholder="Ex.: O que fez você começar a procurar agora?"
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          questionExample: event.target.value,
                        })
                      }
                    />
                  </Field>
                </section>

                <section className="border-border space-y-4 border-t pt-6">
                  <div className="flex items-start gap-3">
                    <span className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <CheckCircle2 className="size-4" />
                    </span>
                    <div>
                      <h4 className="text-foreground text-sm font-semibold">
                        Como reconhecer uma resposta válida
                      </h4>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Estes critérios ajudam a IA a normalizar sem inventar.
                      </p>
                    </div>
                  </div>

                  {choiceType ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-foreground text-sm font-medium">
                          Opções de resposta
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          Use apelidos para expressões que significam a mesma
                          coisa. São necessárias pelo menos duas opções.
                        </p>
                      </div>
                      {draft.options.map((option, index) => (
                        <div
                          key={option.id ?? `new-${index}`}
                          className="border-border bg-muted/20 grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]"
                        >
                          <Field label={`Opção ${index + 1}`}>
                            <Input
                              value={option.label}
                              disabled={disabled}
                              placeholder="Ex.: Para investir"
                              onChange={(event) => {
                                const options = [...draft.options];
                                options[index] = {
                                  ...option,
                                  label: event.target.value,
                                };
                                setDraft({ ...draft, options });
                              }}
                            />
                          </Field>
                          <Field label="Apelidos" hint="Separados por vírgula">
                            <Input
                              value={option.aliases}
                              disabled={disabled}
                              placeholder="investimento, renda"
                              onChange={(event) => {
                                const options = [...draft.options];
                                options[index] = {
                                  ...option,
                                  aliases: event.target.value,
                                };
                                setDraft({ ...draft, options });
                              }}
                            />
                          </Field>
                          {!disabled &&
                          !draft.isSystem &&
                          draft.options.length > 2 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="self-end"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  options: draft.options.filter(
                                    (_, optionIndex) => optionIndex !== index
                                  ),
                                })
                              }
                              aria-label={`Remover opção ${index + 1}`}
                            >
                              <Trash2 />
                            </Button>
                          ) : (
                            <span />
                          )}
                        </div>
                      ))}
                      {!disabled && !draft.isSystem ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              options: [
                                ...draft.options,
                                { label: '', aliases: '' },
                              ],
                            })
                          }
                        >
                          <Plus /> Adicionar opção
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Exemplos de resposta"
                      hint="Um por linha. São exemplos, nunca respostas presumidas."
                    >
                      <Textarea
                        value={draft.answerExamples}
                        rows={4}
                        disabled={disabled}
                        placeholder={
                          'Preciso mudar até dezembro\nAinda estou pesquisando'
                        }
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            answerExamples: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field
                      label="Se a resposta vier ambígua"
                      hint="Oriente como esclarecer sem induzir o lead."
                    >
                      <Textarea
                        value={draft.clarificationGuidance}
                        rows={4}
                        disabled={disabled}
                        placeholder="Ex.: Confirme se o prazo é uma necessidade real ou apenas uma preferência."
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            clarificationGuidance: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>

                  {draft.dataType === 'money_range' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Valor mínimo aceitável"
                        hint="Opcional, em reais e sem formatação."
                      >
                        <Input
                          type="number"
                          min="0"
                          value={draft.minimum}
                          disabled={disabled}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              minimum: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        label="Valor máximo aceitável"
                        hint="Opcional, em reais e sem formatação."
                      >
                        <Input
                          type="number"
                          min="0"
                          value={draft.maximum}
                          disabled={disabled}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              maximum: event.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                  ) : null}

                  <label className="border-border flex items-start justify-between gap-4 rounded-xl border p-3">
                    <span>
                      <span className="text-foreground block text-sm font-medium">
                        Aceitar “não sei” como resposta
                      </span>
                      <span className="text-muted-foreground mt-1 block text-xs leading-5">
                        Registra a falta de definição sem pressionar ou inventar
                        um valor.
                      </span>
                    </span>
                    <Switch
                      checked={draft.allowUnknown}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        setDraft({ ...draft, allowUnknown: checked })
                      }
                      aria-label="Aceitar não sei como resposta"
                    />
                  </label>
                </section>

                <section className="border-border space-y-4 border-t pt-6">
                  <div className="flex items-start gap-3">
                    <span className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <CircleHelp className="size-4" />
                    </span>
                    <div>
                      <h4 className="text-foreground text-sm font-semibold">
                        Quando esta informação entra na conversa
                      </h4>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Condições reduzem perguntas desnecessárias.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Aplicação"
                      hint={
                        draft.isSystem
                          ? 'Objetivos essenciais são sempre aplicáveis.'
                          : 'Uma condição só pode depender de algo anterior.'
                      }
                    >
                      <select
                        value={draft.visibilityMode}
                        disabled={disabled || draft.isSystem}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            visibilityMode: event.target.value as
                              'always' | 'conditional',
                          })
                        }
                        className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm disabled:opacity-60"
                      >
                        <option value="always">
                          Sempre perguntar se faltar
                        </option>
                        <option value="conditional">
                          Somente quando uma condição for atendida
                        </option>
                      </select>
                    </Field>
                    <Field
                      label="Impacto na conclusão"
                      hint="Campos obrigatórios impedem o convite para a call até terem resposta."
                    >
                      <select
                        value={draft.isRequired ? 'required' : 'optional'}
                        disabled={disabled || draft.isSystem}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            isRequired: event.target.value === 'required',
                          })
                        }
                        className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm disabled:opacity-60"
                      >
                        <option value="optional">Complementar</option>
                        <option value="required">
                          Obrigatória para concluir
                        </option>
                      </select>
                    </Field>
                  </div>

                  {draft.visibilityMode === 'conditional' && !draft.isSystem ? (
                    <div className="border-border bg-muted/20 grid gap-4 rounded-xl border p-3 sm:grid-cols-2">
                      <Field label="Informação anterior">
                        <select
                          value={draft.visibilityQuestionKey}
                          required
                          disabled={disabled}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              visibilityQuestionKey: event.target.value,
                            })
                          }
                          className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
                        >
                          <option value="">Selecione</option>
                          {previousQuestions.map((question) => (
                            <option
                              key={String(question.id)}
                              value={String(question.key)}
                            >
                              {String(question.label)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Condição">
                        <select
                          value={draft.visibilityOperator}
                          disabled={disabled}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              visibilityOperator: event.target
                                .value as QuestionDraft['visibilityOperator'],
                            })
                          }
                          className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
                        >
                          <option value="answered">Tiver resposta</option>
                          <option value="not_answered">
                            Ainda não tiver resposta
                          </option>
                          <option value="equals">
                            For igual a um destes valores
                          </option>
                          <option value="includes_any">
                            Incluir um destes valores
                          </option>
                        </select>
                      </Field>
                      {['equals', 'includes_any'].includes(
                        draft.visibilityOperator
                      ) ? (
                        <div className="sm:col-span-2">
                          <Field
                            label="Valores da condição"
                            hint="Separe por vírgulas. Em respostas abertas, use os termos que devem acionar a condição."
                          >
                            <Input
                              value={draft.visibilityValues}
                              required
                              disabled={disabled}
                              placeholder="investir, ambos"
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  visibilityValues: event.target.value,
                                })
                              }
                            />
                          </Field>
                          {selectedDependencyOptions.length ? (
                            <p className="text-muted-foreground mt-2 text-xs">
                              Valores disponíveis:{' '}
                              {selectedDependencyOptions
                                .map(
                                  (option) =>
                                    `${String(option.value)} (${String(option.label)})`
                                )
                                .join(', ')}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {draft.isRequired && !draft.isSystem ? (
                    <div className="border-warning/30 bg-warning-soft text-warning rounded-xl border px-3 py-2.5 text-xs leading-5">
                      Esta informação adicional bloqueará a conclusão da
                      qualificação sempre que estiver aplicável e ainda não
                      tiver uma resposta válida.
                    </div>
                  ) : null}
                </section>
              </div>

              <DialogFooter className="mx-0 mb-0 px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setDraft(null)}
                >
                  {disabled ? 'Fechar' : 'Cancelar'}
                </Button>
                {!disabled ? (
                  <Button type="submit" disabled={saving}>
                    {saving
                      ? 'Salvando...'
                      : draft.id
                        ? 'Salvar configuração'
                        : 'Adicionar informação'}
                  </Button>
                ) : null}
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
