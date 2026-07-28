'use client';

import { FormEvent, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Loader2,
  LogOut,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { runStudiospAction } from '@/hooks/use-studiosp-data';
import {
  isValidBrokerWhatsApp,
  normalizeBrokerWhatsApp,
} from '@/lib/studiosp/broker-phone';

interface BrokerWhatsappOnboardingProps {
  initialPhone?: string;
  onCompleted: () => void;
  onSignOut: () => Promise<void>;
}

export function BrokerWhatsappOnboarding({
  initialPhone = '',
  onCompleted,
  onSignOut,
}: BrokerWhatsappOnboardingProps) {
  const [whatsapp, setWhatsapp] = useState(initialPhone);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeBrokerWhatsApp(whatsapp);
    if (!isValidBrokerWhatsApp(normalized)) {
      setError('Informe um WhatsApp válido com DDI, como +55 11 99999-9999.');
      return;
    }
    if (!consent) {
      setError('Confirme que o número é seu para continuar.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await runStudiospAction('register_own_broker_whatsapp', {
        whatsappE164: normalized,
      });
      onCompleted();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível confirmar seu WhatsApp. Tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  }

  const canSubmit =
    isValidBrokerWhatsApp(whatsapp) && consent && !saving && !signingOut;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center justify-center gap-2.5">
          <div className="border-primary/20 bg-primary-soft text-primary flex size-9 items-center justify-center rounded-xl border">
            <Building2 className="size-4" />
          </div>
          <div>
            <p className="text-foreground text-sm leading-none font-semibold">
              Studiosp
            </p>
            <p className="text-muted-foreground mt-1 text-[10px] tracking-wider uppercase">
              Ativação do corretor
            </p>
          </div>
        </div>

        <Card className="border-border">
          <CardHeader className="border-border border-b">
            <div className="border-primary/20 bg-primary-soft text-primary mb-2 flex size-11 items-center justify-center rounded-xl border">
              <MessageCircle className="size-5" />
            </div>
            <CardTitle>Confirme seu WhatsApp operacional</CardTitle>
            <CardDescription className="leading-relaxed">
              Esta etapa é obrigatória. A IA usará este número para confirmar se
              você pode realizar as reuniões reservadas para a equipe.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <label
                  htmlFor="onboarding-broker-whatsapp"
                  className="text-foreground text-sm font-medium"
                >
                  Seu WhatsApp com DDI
                </label>
                <Input
                  id="onboarding-broker-whatsapp"
                  name="brokerWhatsapp"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+55 11 99999-9999"
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  onBlur={() =>
                    setWhatsapp(
                      (current) => normalizeBrokerWhatsApp(current) || current
                    )
                  }
                  aria-describedby="onboarding-broker-whatsapp-help"
                  aria-invalid={
                    whatsapp.length > 0 && !isValidBrokerWhatsApp(whatsapp)
                  }
                  className="h-11"
                  required
                  autoFocus
                />
                <p
                  id="onboarding-broker-whatsapp-help"
                  className="text-muted-foreground text-xs leading-relaxed"
                >
                  Use o número que você acompanha diariamente. Ele não será
                  mostrado aos leads.
                </p>
              </div>

              <label className="border-border/70 bg-muted/25 flex min-h-11 items-start gap-3 rounded-xl border p-3">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="accent-primary mt-0.5 size-4 shrink-0"
                />
                <span className="text-muted-foreground text-xs leading-relaxed">
                  Confirmo que este número é meu e pode receber mensagens
                  operacionais da Studiosp sobre reuniões e disponibilidade.
                </span>
              </label>

              {error ? (
                <div
                  role="alert"
                  className="border-destructive/30 bg-destructive/10 text-destructive rounded-xl border px-3 py-2.5 text-sm"
                >
                  {error}
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="h-11 w-full"
                disabled={!canSubmit}
              >
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Confirmando…
                  </>
                ) : (
                  <>
                    <CheckCircle2 />
                    Confirmar e acessar o painel
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="text-muted-foreground flex items-start gap-2 text-xs">
            <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
            <span>
              O número fica restrito à operação e às mensagens internas.
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={handleSignOut}
            disabled={saving || signingOut}
            className="justify-self-start sm:justify-self-end"
          >
            {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
            Sair da conta
          </Button>
        </div>
      </div>
    </div>
  );
}
