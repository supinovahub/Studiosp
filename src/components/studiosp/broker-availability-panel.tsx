'use client';

import {
  Bell,
  CalendarClock,
  CalendarOff,
  Check,
  Clock3,
  Copy,
  MessageCircle,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { runStudiospAction } from '@/hooks/use-studiosp-data';
import type { StudiospData } from '@/lib/studiosp/types';
import { formatDateTime } from '@/lib/studiosp/labels';
import { cn } from '@/lib/utils';
import { StatusBadge } from './status-badge';

const WEEKDAYS = [
  { value: 1, short: 'Seg', label: 'Segunda-feira' },
  { value: 2, short: 'Ter', label: 'Terça-feira' },
  { value: 3, short: 'Qua', label: 'Quarta-feira' },
  { value: 4, short: 'Qui', label: 'Quinta-feira' },
  { value: 5, short: 'Sex', label: 'Sexta-feira' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 0, short: 'Dom', label: 'Domingo' },
];

const CALL_DURATIONS = [10, 15, 20, 30, 45] as const;

interface RuleDraft {
  weekday: number;
  start_time: string;
  end_time: string;
}

interface BrokerAvailabilityPanelProps {
  data: StudiospData;
  onReload: () => Promise<void>;
  compact?: boolean;
}

function clock(value: unknown) {
  return String(value ?? '').slice(0, 5);
}

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function pauseUntil(preset: string) {
  if (preset === 'indefinite') return null;
  const target = new Date();
  if (preset === 'tomorrow') target.setDate(target.getDate() + 1);
  target.setHours(23, 59, 59, 999);
  return target.toISOString();
}

export function BrokerAvailabilityPanel({
  data,
  onReload,
  compact = false,
}: BrokerAvailabilityPanelProps) {
  const currentBroker = (data.brokers ?? []).find(
    (broker) => broker.id === data.brokerProfileId
  );
  const companyWindows = (data.windows ?? []).filter(
    (window) => window.broker_profile_id === data.brokerProfileId
  );
  const serverRules = useMemo(
    () =>
      (data.personalAvailability ?? [])
        .filter((rule) => rule.broker_profile_id === data.brokerProfileId)
        .map((rule) => ({
          weekday: Number(rule.weekday),
          start_time: clock(rule.start_time),
          end_time: clock(rule.end_time),
        })),
    [data.brokerProfileId, data.personalAvailability]
  );
  const exceptions = (data.availabilityExceptions ?? []).filter(
    (exception) => exception.broker_profile_id === data.brokerProfileId
  );
  const bufferMinutes = Number(data.schedulingPolicy?.buffer_minutes ?? 15);
  const [rules, setRules] = useState<RuleDraft[]>(serverRules);
  const [duration, setDuration] = useState(
    Number(currentBroker?.preferred_call_duration_minutes ?? 10)
  );
  const notifications =
    currentBroker?.notification_preferences &&
    typeof currentBroker.notification_preferences === 'object'
      ? (currentBroker.notification_preferences as Record<string, unknown>)
      : {};
  const [dashboardNotifications, setDashboardNotifications] = useState(
    notifications.dashboard !== false
  );
  const [whatsappNotifications, setWhatsappNotifications] = useState(
    notifications.whatsapp !== false
  );
  const [pausePreset, setPausePreset] = useState('today');
  const [exceptionStart, setExceptionStart] = useState('');
  const [exceptionEnd, setExceptionEnd] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  if (!currentBroker) return null;

  const unavailableUntil = currentBroker.unavailable_until
    ? new Date(String(currentBroker.unavailable_until))
    : null;
  const paused =
    currentBroker.is_available === false &&
    (!unavailableUntil || unavailableUntil > new Date());
  const weeklyMinutes = rules.reduce((total, rule) => {
    const [startHour, startMinute] = rule.start_time.split(':').map(Number);
    const [endHour, endMinute] = rule.end_time.split(':').map(Number);
    return (
      total +
      Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute))
    );
  }, 0);

  async function execute(
    key: string,
    action: string,
    payload: Record<string, unknown>,
    success: string
  ) {
    setSaving(key);
    setMessage(null);
    try {
      await runStudiospAction(action, payload);
      setMessage({ type: 'success', text: success });
      await onReload();
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar a alteração.',
      });
    } finally {
      setSaving(null);
    }
  }

  function rulesFor(weekday: number) {
    return rules.filter((rule) => rule.weekday === weekday);
  }

  function toggleDay(weekday: number, enabled: boolean) {
    if (!enabled) {
      setRules((current) => current.filter((rule) => rule.weekday !== weekday));
      return;
    }
    const firstLimit = companyWindows.find(
      (window) => Number(window.weekday) === weekday
    );
    setRules((current) => [
      ...current,
      {
        weekday,
        start_time: firstLimit ? clock(firstLimit.start_time) : '09:00',
        end_time: firstLimit ? clock(firstLimit.end_time) : '18:00',
      },
    ]);
  }

  function addRange(weekday: number) {
    const dayRules = rulesFor(weekday);
    const firstLimit = companyWindows.find(
      (window) => Number(window.weekday) === weekday
    );
    const previous = dayRules.at(-1);
    setRules((current) => [
      ...current,
      {
        weekday,
        start_time:
          previous?.end_time ?? clock(firstLimit?.start_time ?? '09:00'),
        end_time: clock(firstLimit?.end_time ?? '18:00'),
      },
    ]);
  }

  function updateRule(
    weekday: number,
    index: number,
    field: 'start_time' | 'end_time',
    value: string
  ) {
    let dayIndex = -1;
    setRules((current) =>
      current.map((rule) => {
        if (rule.weekday !== weekday) return rule;
        dayIndex += 1;
        return dayIndex === index ? { ...rule, [field]: value } : rule;
      })
    );
  }

  function removeRule(weekday: number, index: number) {
    let dayIndex = -1;
    setRules((current) =>
      current.filter((rule) => {
        if (rule.weekday !== weekday) return true;
        dayIndex += 1;
        return dayIndex !== index;
      })
    );
  }

  function copyMondayToWeekdays() {
    const monday = rulesFor(1);
    if (!monday.length) return;
    setRules((current) => [
      ...current.filter((rule) => ![2, 3, 4, 5].includes(rule.weekday)),
      ...[2, 3, 4, 5].flatMap((weekday) =>
        monday.map((rule) => ({ ...rule, weekday }))
      ),
    ]);
  }

  async function addException() {
    if (!exceptionStart || !exceptionEnd) {
      setMessage({
        type: 'error',
        text: 'Informe o início e o fim do bloqueio.',
      });
      return;
    }
    await execute(
      'exception',
      'add_my_availability_exception',
      {
        startsAt: new Date(exceptionStart).toISOString(),
        endsAt: new Date(exceptionEnd).toISOString(),
        reason: exceptionReason,
      },
      'Bloqueio adicionado à sua agenda.'
    );
    setExceptionStart('');
    setExceptionEnd('');
    setExceptionReason('');
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div
          role="status"
          className={cn(
            'rounded-lg border px-3 py-2.5 text-sm',
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-destructive/35 bg-destructive/10 text-destructive'
          )}
        >
          {message.text}
        </div>
      ) : null}

      <section className="border-border bg-card overflow-hidden rounded-xl border">
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg border',
                paused
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                  : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              )}
            >
              {paused ? (
                <CalendarOff className="size-5" />
              ) : (
                <CalendarClock className="size-5" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-foreground text-sm font-semibold">
                  {paused
                    ? 'Novas reuniões pausadas'
                    : 'Aceitando novas reuniões'}
                </h2>
                <StatusBadge
                  compact
                  label={paused ? 'Pausado' : 'Disponível'}
                  tone={paused ? 'warning' : 'success'}
                />
              </div>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {paused
                  ? unavailableUntil
                    ? `Retorno automático previsto para ${formatDateTime(unavailableUntil.toISOString())}.`
                    : 'Você não receberá novos convites até retomar manualmente.'
                  : `${Math.round((weeklyMinutes / 60) * 10) / 10} h semanais configuradas · ${duration + bufferMinutes} min bloqueados por reunião.`}
              </p>
            </div>
          </div>
          {paused ? (
            <Button
              onClick={() =>
                execute(
                  'status',
                  'set_availability',
                  { isAvailable: true },
                  'Você voltou a aceitar novas reuniões.'
                )
              }
              disabled={saving !== null}
            >
              <Check /> Retomar agora
            </Button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="pause-preset">
                Duração da pausa
              </label>
              <select
                id="pause-preset"
                value={pausePreset}
                onChange={(event) => setPausePreset(event.target.value)}
                className="border-input bg-background text-foreground h-9 min-w-40 rounded-lg border px-3 text-sm"
              >
                <option value="today">Até o fim de hoje</option>
                <option value="tomorrow">Até amanhã</option>
                <option value="indefinite">Sem data para voltar</option>
              </select>
              <Button
                variant="outline"
                onClick={() =>
                  execute(
                    'status',
                    'set_availability',
                    {
                      isAvailable: false,
                      unavailableUntil: pauseUntil(pausePreset),
                    },
                    'Novas reuniões foram pausadas.'
                  )
                }
                disabled={saving !== null}
              >
                <CalendarOff /> Pausar
              </Button>
            </div>
          )}
        </div>
      </section>

      {!compact ? (
        <section className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="border-border flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                Agenda semanal
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Defina quando você aceita novos agendamentos dentro da cobertura
                liberada pela empresa.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={copyMondayToWeekdays}
              disabled={!rulesFor(1).length || saving !== null}
            >
              <Copy /> Copiar segunda para dias úteis
            </Button>
          </div>

          <div className="divide-border divide-y">
            {WEEKDAYS.map((day) => {
              const dayRules = rulesFor(day.value);
              const limits = companyWindows.filter(
                (window) => Number(window.weekday) === day.value
              );
              return (
                <div
                  key={day.value}
                  className="grid gap-3 p-4 lg:grid-cols-[160px_1fr]"
                >
                  <div className="flex items-center justify-between gap-3 lg:justify-start">
                    <Switch
                      checked={dayRules.length > 0}
                      onCheckedChange={(checked) =>
                        toggleDay(day.value, checked)
                      }
                      aria-label={`${dayRules.length ? 'Desativar' : 'Ativar'} ${day.label}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground text-sm font-medium">
                        {day.label}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        {limits.length
                          ? `Empresa: ${limits
                              .map(
                                (window) =>
                                  `${clock(window.start_time)}–${clock(window.end_time)}`
                              )
                              .join(', ')}`
                          : 'Sem cobertura da empresa'}
                      </p>
                    </div>
                  </div>

                  {dayRules.length ? (
                    <div className="space-y-2">
                      {dayRules.map((rule, index) => (
                        <div
                          key={`${day.value}-${index}`}
                          className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2"
                        >
                          <Input
                            type="time"
                            aria-label={`Início em ${day.label}`}
                            value={rule.start_time}
                            onChange={(event) =>
                              updateRule(
                                day.value,
                                index,
                                'start_time',
                                event.target.value
                              )
                            }
                          />
                          <span className="text-muted-foreground text-xs">
                            até
                          </span>
                          <Input
                            type="time"
                            aria-label={`Fim em ${day.label}`}
                            value={rule.end_time}
                            onChange={(event) =>
                              updateRule(
                                day.value,
                                index,
                                'end_time',
                                event.target.value
                              )
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remover faixa de ${day.label}`}
                            onClick={() => removeRule(day.value, index)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addRange(day.value)}
                        disabled={!limits.length}
                      >
                        <Plus /> Adicionar faixa
                      </Button>
                    </div>
                  ) : (
                    <div className="border-border bg-muted/20 text-muted-foreground flex min-h-11 items-center rounded-lg border border-dashed px-3 text-xs">
                      {limits.length
                        ? 'Indisponível neste dia'
                        : 'A empresa ainda não liberou horários neste dia'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-border flex justify-end border-t p-4">
            <Button
              onClick={() =>
                execute(
                  'schedule',
                  'save_my_availability',
                  { rules },
                  'Sua agenda semanal foi atualizada.'
                )
              }
              disabled={saving !== null}
            >
              <Save />{' '}
              {saving === 'schedule' ? 'Salvando...' : 'Salvar agenda semanal'}
            </Button>
          </div>
        </section>
      ) : null}

      <div className={cn('grid gap-4', !compact && 'xl:grid-cols-2')}>
        <section className="border-border bg-card rounded-xl border">
          <div className="border-border border-b p-4">
            <div className="flex items-start gap-3">
              <div className="border-primary/20 bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg border">
                <Clock3 className="size-4" />
              </div>
              <div>
                <h2 className="text-foreground text-sm font-semibold">
                  Tempo reservado por reunião
                </h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  Escolha a duração esperada da conversa. O intervalo de
                  proteção é aplicado automaticamente.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div
              role="radiogroup"
              aria-label="Duração esperada da reunião"
              className="grid grid-cols-3 gap-2 sm:grid-cols-5"
            >
              {CALL_DURATIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={duration === minutes}
                  onClick={() => setDuration(minutes)}
                  className={cn(
                    'min-h-11 rounded-lg border px-2 text-sm font-medium transition-colors',
                    duration === minutes
                      ? 'border-primary/60 bg-primary/10 text-primary ring-primary/20 ring-2'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  {minutes} min
                </button>
              ))}
            </div>
            <div className="border-border bg-muted/25 grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
              <Metric label="Conversa" value={`${duration} min`} />
              <Metric label="Intervalo" value={`${bufferMinutes} min`} />
              <Metric
                label="Bloqueio total"
                value={`${duration + bufferMinutes} min`}
                primary
              />
            </div>
            <div className="border-border space-y-3 border-t pt-4">
              <NotificationToggle
                icon={Bell}
                title="Alertas no painel"
                description="Convites, prazos e pendências pessoais."
                checked={dashboardNotifications}
                onCheckedChange={setDashboardNotifications}
              />
              <NotificationToggle
                icon={MessageCircle}
                title="Alertas no WhatsApp"
                description="Confirmações e lembretes no seu número operacional."
                checked={whatsappNotifications}
                onCheckedChange={setWhatsappNotifications}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  execute(
                    'preferences',
                    'save_my_broker_preferences',
                    {
                      callDurationMinutes: duration,
                      dashboardNotifications,
                      whatsappNotifications,
                    },
                    'Preferências operacionais atualizadas.'
                  )
                }
                disabled={saving !== null}
              >
                <Save /> Salvar preferências
              </Button>
            </div>
          </div>
        </section>

        {!compact ? (
          <section className="border-border bg-card rounded-xl border">
            <div className="border-border border-b p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300">
                  <CalendarOff className="size-4" />
                </div>
                <div>
                  <h2 className="text-foreground text-sm font-semibold">
                    Bloqueios pontuais
                  </h2>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Consultas, viagens e períodos em que você não poderá
                    atender.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs">
                  <span className="text-foreground font-medium">Início</span>
                  <Input
                    type="datetime-local"
                    value={exceptionStart}
                    min={localDateTimeValue(new Date())}
                    onChange={(event) => setExceptionStart(event.target.value)}
                  />
                </label>
                <label className="space-y-1.5 text-xs">
                  <span className="text-foreground font-medium">Fim</span>
                  <Input
                    type="datetime-local"
                    value={exceptionEnd}
                    min={exceptionStart || localDateTimeValue(new Date())}
                    onChange={(event) => setExceptionEnd(event.target.value)}
                  />
                </label>
              </div>
              <label className="space-y-1.5 text-xs">
                <span className="text-foreground font-medium">
                  Motivo{' '}
                  <span className="text-muted-foreground">(opcional)</span>
                </span>
                <Input
                  value={exceptionReason}
                  onChange={(event) => setExceptionReason(event.target.value)}
                  placeholder="Ex.: consulta médica"
                />
              </label>
              <Button
                variant="outline"
                onClick={addException}
                disabled={saving !== null}
              >
                <Plus /> Adicionar bloqueio
              </Button>

              {exceptions.length ? (
                <div className="divide-border border-border overflow-hidden rounded-lg border">
                  {exceptions.map((exception) => (
                    <div
                      key={String(exception.id)}
                      className="flex items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-foreground truncate text-xs font-medium">
                          {String(exception.reason)}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-[11px]">
                          {formatDateTime(String(exception.starts_at))} até{' '}
                          {formatDateTime(String(exception.ends_at))}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover bloqueio ${String(exception.reason)}`}
                        onClick={() =>
                          execute(
                            `delete-${String(exception.id)}`,
                            'delete_my_availability_exception',
                            { exceptionId: exception.id },
                            'Bloqueio removido.'
                          )
                        }
                        disabled={saving !== null}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-border bg-muted/20 text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
                  Nenhum bloqueio futuro.
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold tabular-nums',
          primary ? 'text-primary' : 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function NotificationToggle({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="border-border bg-muted/35 text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg border">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-xs font-medium">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={title}
      />
    </div>
  );
}
