'use client';

import Link from 'next/link';
import {
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  MessageCircle,
  MonitorCog,
  Save,
  Shield,
  UserRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import {
  isValidBrokerWhatsApp,
  normalizeBrokerWhatsApp,
} from '@/lib/studiosp/broker-phone';
import type { StudiospData } from '@/lib/studiosp/types';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingState } from './operational-state';
import { PageHeader } from './page-header';
import { StatusBadge } from './status-badge';

const accountLinks = [
  {
    href: '/settings?tab=profile',
    title: 'Meu perfil',
    description: 'Nome, foto e endereço de e-mail',
    icon: UserRound,
  },
  {
    href: '/settings?tab=security',
    title: 'Login e segurança',
    description: 'Senha e sessões conectadas',
    icon: Shield,
  },
  {
    href: '/settings?tab=appearance',
    title: 'Aparência',
    description: 'Tema, modo e cor de destaque',
    icon: MonitorCog,
  },
];

export function BrokerSettingsPage() {
  const { data, loading, error, reload } = useStudiospData('team');
  const currentBroker = data?.brokers?.find(
    (broker) => broker.id === data.brokerProfileId
  );

  if (loading) return <LoadingState label="Carregando suas configurações..." />;
  if (error || !data || !currentBroker) {
    return (
      <ErrorState
        error={error ?? 'Perfil operacional não encontrado.'}
        onRetry={reload}
      />
    );
  }

  return (
    <BrokerSettingsContent
      key={String(currentBroker.id)}
      data={data}
      currentBroker={currentBroker}
      reload={reload}
    />
  );
}

function BrokerSettingsContent({
  data,
  currentBroker,
  reload,
}: {
  data: StudiospData;
  currentBroker: Record<string, unknown>;
  reload: () => Promise<void>;
}) {
  const notificationPreferences =
    currentBroker.notification_preferences &&
    typeof currentBroker.notification_preferences === 'object'
      ? (currentBroker.notification_preferences as Record<string, unknown>)
      : {};
  const [phone, setPhone] = useState(String(currentBroker.whatsapp_e164 ?? ''));
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [dashboardNotifications, setDashboardNotifications] = useState(
    notificationPreferences.dashboard !== false
  );
  const [whatsappNotifications, setWhatsappNotifications] = useState(
    notificationPreferences.whatsapp !== false
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const weeklyMinutes = useMemo(
    () =>
      (data.personalAvailability ?? []).reduce((total, rule) => {
        const [startHour, startMinute] = String(rule.start_time)
          .slice(0, 5)
          .split(':')
          .map(Number);
        const [endHour, endMinute] = String(rule.end_time)
          .slice(0, 5)
          .split(':')
          .map(Number);
        return (
          total +
          Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute))
        );
      }, 0),
    [data.personalAvailability]
  );
  const duration = Number(currentBroker.preferred_call_duration_minutes ?? 10);
  const buffer = Number(data.schedulingPolicy?.buffer_minutes ?? 15);
  const normalizedCurrentPhone = normalizeBrokerWhatsApp(
    String(currentBroker.whatsapp_e164 ?? '')
  );
  const normalizedDraftPhone = normalizeBrokerWhatsApp(phone);
  const phoneChanged = normalizedDraftPhone !== normalizedCurrentPhone;

  async function execute(
    key: string,
    action: string,
    payload: Record<string, unknown>,
    success: string
  ) {
    setSaving(key);
    setFeedback(null);
    try {
      await runStudiospAction(action, payload);
      setFeedback({ type: 'success', text: success });
      await reload();
    } catch (actionError) {
      setFeedback({
        type: 'error',
        text:
          actionError instanceof Error
            ? actionError.message
            : 'Não foi possível salvar.',
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sua conta"
        title="Configurações do corretor"
        description="Dados pessoais, canal operacional e preferências que afetam somente a sua rotina."
      />

      {feedback ? (
        <div
          role="status"
          className={cn(
            'rounded-lg border px-3 py-2.5 text-sm',
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-destructive/35 bg-destructive/10 text-destructive'
          )}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="border-border flex items-start gap-3 border-b p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <MessageCircle className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-foreground text-sm font-semibold">
                  WhatsApp operacional
                </h2>
                <StatusBadge
                  compact
                  label={
                    currentBroker.whatsapp_verified_at
                      ? 'Confirmado'
                      : 'Pendente'
                  }
                  tone={
                    currentBroker.whatsapp_verified_at ? 'success' : 'warning'
                  }
                />
              </div>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                A IA usa este número para confirmar reuniões e enviar alertas.
                Ele não é mostrado aos leads.
              </p>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <label className="block space-y-1.5">
              <span className="text-foreground text-xs font-medium">
                Número com DDI
              </span>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneConfirmed(false);
                }}
                onBlur={() =>
                  setPhone(
                    (current) => normalizeBrokerWhatsApp(current) || current
                  )
                }
                placeholder="+55 11 99999-9999"
                aria-invalid={phone.length > 0 && !isValidBrokerWhatsApp(phone)}
              />
            </label>
            {phoneChanged ? (
              <label className="border-border bg-muted/25 flex min-h-11 items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  checked={phoneConfirmed}
                  onChange={(event) => setPhoneConfirmed(event.target.checked)}
                  className="accent-primary mt-0.5 size-4 shrink-0"
                />
                <span className="text-muted-foreground text-xs leading-relaxed">
                  Confirmo que este número é meu e pode receber mensagens
                  operacionais da Studiosp.
                </span>
              </label>
            ) : null}
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  execute(
                    'phone',
                    'register_own_broker_whatsapp',
                    { whatsappE164: normalizedDraftPhone },
                    'WhatsApp operacional atualizado.'
                  )
                }
                disabled={
                  saving !== null ||
                  !phoneChanged ||
                  !phoneConfirmed ||
                  !isValidBrokerWhatsApp(normalizedDraftPhone)
                }
              >
                <Check /> Confirmar número
              </Button>
            </div>
          </div>
        </section>

        <section className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="border-border flex items-start gap-3 border-b p-4">
            <div className="border-primary/20 bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg border">
              <CalendarClock className="size-5" />
            </div>
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                Disponibilidade e agenda
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Sua cobertura semanal e o tempo reservado por reunião.
              </p>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-3 gap-2">
              <SummaryMetric
                label="Status"
                value={currentBroker.is_available ? 'Disponível' : 'Pausado'}
              />
              <SummaryMetric
                label="Por semana"
                value={`${Math.round((weeklyMinutes / 60) * 10) / 10} h`}
              />
              <SummaryMetric
                label="Bloqueio"
                value={`${duration + buffer} min`}
                primary
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              render={<Link href="/equipe" />}
            >
              <Clock3 /> Gerenciar minha disponibilidade
            </Button>
          </div>
        </section>
      </div>

      <section className="border-border bg-card overflow-hidden rounded-xl border">
        <div className="border-border border-b p-4">
          <h2 className="text-foreground text-sm font-semibold">
            Notificações operacionais
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Escolha onde receber convites, lembretes e pendências atribuídas a
            você.
          </p>
        </div>
        <div className="divide-border divide-y">
          <NotificationRow
            icon={MonitorCog}
            title="Alertas no painel"
            description="Convites, prazos e atualizações aparecem no dashboard."
            checked={dashboardNotifications}
            onCheckedChange={setDashboardNotifications}
          />
          <NotificationRow
            icon={MessageCircle}
            title="Alertas no WhatsApp"
            description="A IA envia confirmações e lembretes no número operacional."
            checked={whatsappNotifications}
            onCheckedChange={setWhatsappNotifications}
          />
        </div>
        <div className="border-border flex justify-end border-t p-4">
          <Button
            onClick={() =>
              execute(
                'notifications',
                'save_my_broker_preferences',
                {
                  callDurationMinutes: duration,
                  dashboardNotifications,
                  whatsappNotifications,
                },
                'Preferências de notificação atualizadas.'
              )
            }
            disabled={saving !== null}
          >
            <Save /> Salvar notificações
          </Button>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {accountLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group border-border bg-card hover:border-primary/30 hover:bg-muted/25 flex min-h-24 items-center gap-3 rounded-xl border p-4 transition-colors"
          >
            <div className="border-border bg-muted/40 text-muted-foreground group-hover:text-primary flex size-10 shrink-0 items-center justify-center rounded-lg border">
              <item.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-foreground text-sm font-semibold">
                {item.title}
              </h3>
              <p className="text-muted-foreground mt-1 text-xs">
                {item.description}
              </p>
            </div>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div className="border-border bg-muted/25 rounded-lg border p-3 text-center">
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

function NotificationRow({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: typeof MonitorCog;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="border-border bg-muted/35 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg border">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={title}
      />
    </div>
  );
}
