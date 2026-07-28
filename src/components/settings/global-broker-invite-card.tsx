'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Power,
  RefreshCw,
  ShieldCheck,
  UserRoundPlus,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';

interface GlobalBrokerInvite {
  id: string;
  createdAt: string;
  updatedAt: string;
  redemptionCount: number;
}

interface StoredInviteUrl {
  id: string;
  url: string;
}

type Confirmation = 'rotate' | 'disable' | null;

function storageKey(accountId: string): string {
  return `studiosp:global-broker-invite:${accountId}`;
}

function readStoredUrl(accountId: string, activeLinkId: string): string | null {
  try {
    const raw = window.localStorage.getItem(storageKey(accountId));
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredInviteUrl>;
    return stored.id === activeLinkId && typeof stored.url === 'string'
      ? stored.url
      : null;
  } catch {
    return null;
  }
}

export function GlobalBrokerInviteCard() {
  const { accountId, isOwner, profileLoading } = useAuth();
  const [link, setLink] = useState<GlobalBrokerInvite | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  const loadLink = useCallback(async () => {
    if (!isOwner || !accountId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/account/broker-invite-link', {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        link?: GlobalBrokerInvite | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Falha ao carregar o link global');
      }

      const activeLink = payload.link ?? null;
      setLink(activeLink);
      setUrl(activeLink ? readStoredUrl(accountId, activeLink.id) : null);
    } catch (loadError) {
      console.error('[GlobalBrokerInviteCard] load error:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar o link global'
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, isOwner]);

  useEffect(() => {
    if (!profileLoading) void loadLink();
  }, [loadLink, profileLoading]);

  const generateLink = useCallback(async () => {
    if (!accountId) return;
    setPending(true);
    try {
      const response = await fetch('/api/account/broker-invite-link', {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        link?: GlobalBrokerInvite;
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.link || !payload.url) {
        throw new Error(payload.error || 'Falha ao gerar o link global');
      }

      const stored: StoredInviteUrl = {
        id: payload.link.id,
        url: payload.url,
      };
      window.localStorage.setItem(
        storageKey(accountId),
        JSON.stringify(stored)
      );
      setLink(payload.link);
      setUrl(payload.url);
      setConfirmation(null);
      toast.success(link ? 'Novo link global criado' : 'Link global criado');
    } catch (generateError) {
      console.error('[GlobalBrokerInviteCard] generate error:', generateError);
      toast.error(
        generateError instanceof Error
          ? generateError.message
          : 'Falha ao gerar o link global'
      );
    } finally {
      setPending(false);
    }
  }, [accountId, link]);

  const disableLink = useCallback(async () => {
    if (!accountId) return;
    setPending(true);
    try {
      const response = await fetch('/api/account/broker-invite-link', {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Falha ao desativar o link global');
      }

      window.localStorage.removeItem(storageKey(accountId));
      setLink(null);
      setUrl(null);
      setConfirmation(null);
      toast.success('Link global desativado');
    } catch (disableError) {
      console.error('[GlobalBrokerInviteCard] disable error:', disableError);
      toast.error(
        disableError instanceof Error
          ? disableError.message
          : 'Falha ao desativar o link global'
      );
    } finally {
      setPending(false);
    }
  }, [accountId]);

  const copyLink = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado');
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      console.error('[GlobalBrokerInviteCard] copy error:', copyError);
      toast.error('Não foi possível copiar. Selecione o link manualmente.');
    }
  }, [url]);

  if (profileLoading || !isOwner) return null;

  if (loading) {
    return (
      <Card aria-busy="true">
        <CardContent className="flex min-h-32 items-center justify-center">
          <Loader2 className="text-primary size-5 animate-spin" />
          <span className="sr-only">Carregando link global</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert>
        <Link2 />
        <AlertTitle>Não foi possível carregar o link global</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadLink}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <div className="border-primary/20 bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg border">
            <UserRoundPlus className="size-5" />
          </div>
          <CardTitle className="mt-2">Link global para corretores</CardTitle>
          <CardDescription className="max-w-2xl text-pretty">
            Compartilhe o mesmo link em grupos. Cada corretor cria o próprio
            acesso e informa o WhatsApp operacional antes de entrar na equipe.
          </CardDescription>
          <CardAction>
            <Badge
              className={
                link
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-border bg-muted text-muted-foreground'
              }
            >
              {link ? 'Ativo' : 'Desativado'}
            </Badge>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-4">
          {link ? (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <label
                    htmlFor="global-broker-invite-url"
                    className="text-foreground text-xs font-medium"
                  >
                    Link de cadastro
                  </label>
                  {url ? (
                    <Input
                      id="global-broker-invite-url"
                      value={url}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                      className="mt-1.5 h-10 font-mono text-xs"
                    />
                  ) : (
                    <div
                      id="global-broker-invite-url"
                      className="border-border bg-muted/30 text-muted-foreground mt-1.5 flex min-h-10 items-center rounded-lg border px-3 text-xs"
                    >
                      O link foi criado em outro navegador ou não está mais
                      salvo neste dispositivo.
                    </div>
                  )}
                </div>

                <div className="flex items-end">
                  {url ? (
                    <Button
                      onClick={copyLink}
                      className="h-10 w-full sm:w-auto"
                    >
                      {copied ? (
                        <Check className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                      {copied ? 'Copiado' : 'Copiar link'}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setConfirmation('rotate')}
                      className="h-10 w-full sm:w-auto"
                    >
                      <RefreshCw className="size-4" />
                      Criar link copiável
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-border bg-muted/20 grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">
                    Corretores cadastrados por este link
                  </p>
                  <p className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                    {link.redemptionCount}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Ativo desde</p>
                  <p className="text-foreground mt-1 text-sm font-medium">
                    {new Date(link.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setConfirmation('rotate')}
                >
                  <RefreshCw className="size-4" />
                  Trocar link
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmation('disable')}
                >
                  <Power className="size-4" />
                  Desativar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <ShieldCheck className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-foreground text-sm font-medium">
                    Nenhum link global ativo
                  </p>
                  <p className="text-muted-foreground mt-1 max-w-xl text-xs leading-relaxed">
                    O link não expira automaticamente. Você pode trocá-lo ou
                    desativá-lo a qualquer momento para impedir novos acessos.
                  </p>
                </div>
              </div>
              <Button
                onClick={generateLink}
                disabled={pending}
                className="h-10 shrink-0"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Link2 className="size-4" />
                )}
                Gerar link global
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmation === 'rotate'
                ? 'Trocar o link global?'
                : 'Desativar o link global?'}
            </DialogTitle>
            <DialogDescription>
              {confirmation === 'rotate'
                ? 'O link atual deixará de aceitar novos corretores assim que o novo for criado. Acessos já cadastrados não serão alterados.'
                : 'Novos corretores não conseguirão entrar por este link. Acessos já cadastrados continuarão funcionando normalmente.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmation(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant={confirmation === 'disable' ? 'destructive' : 'default'}
              onClick={confirmation === 'rotate' ? generateLink : disableLink}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {confirmation === 'rotate' ? 'Criar novo link' : 'Desativar link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
