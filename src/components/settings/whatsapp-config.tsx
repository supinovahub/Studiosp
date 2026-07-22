'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  QrCode,
  RotateCcw,
  Unplug,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsPanelHead } from './settings-panel-head';

const MASKED_TOKEN = '••••••••••••••••';

type Provider = 'meta' | 'uazapi';
type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'unknown';

interface ConnectResult {
  connected?: boolean;
  logged_in?: boolean;
  status?: string;
  phone?: string;
  qrcode?: string;
  paircode?: string;
  error?: string;
}

export function WhatsAppConfig() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();
  const loadedAccountRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [provider, setProvider] = useState<Provider>('uazapi');
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('unknown');
  const [statusMessage, setStatusMessage] = useState('');

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [uazapiBaseUrl, setUazapiBaseUrl] = useState('https://');
  const [pairingPhone, setPairingPhone] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);
  const [connectResult, setConnectResult] = useState<ConnectResult | null>(
    null
  );

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(
    /\/$/,
    ''
  );
  const metaWebhookUrl = configuredSiteUrl
    ? `${configuredSiteUrl}/api/whatsapp/webhook`
    : '/api/whatsapp/webhook';

  const hydrate = useCallback((data: WhatsAppConfigType | null) => {
    setConfig(data);
    const savedProvider = data?.provider ?? 'uazapi';
    setProvider(savedProvider);
    setPhoneNumberId(data?.phone_number_id ?? '');
    setWabaId(data?.waba_id ?? '');
    setUazapiBaseUrl(data?.uazapi_base_url ?? 'https://');
    setAccessToken(data ? MASKED_TOKEN : '');
    setVerifyToken('');
    setPin('');
    setTokenEdited(false);
    setConnectResult(null);
  }, []);

  const testConnection = useCallback(async (showToast = true) => {
    setTesting(true);
    try {
      const response = await fetch('/api/whatsapp/config', {
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || 'Falha ao testar a conexão.');

      if (payload.connected) {
        setConnectionStatus('connected');
        setStatusMessage('Conexão ativa e credenciais validadas.');
        if (showToast) toast.success('WhatsApp conectado com sucesso.');
      } else {
        setConnectionStatus(
          payload.status === 'connecting' ? 'connecting' : 'disconnected'
        );
        setStatusMessage(
          payload.message || 'O WhatsApp ainda não está conectado.'
        );
        if (showToast) toast.error(payload.message || 'Conexão não concluída.');
      }
    } catch (error) {
      setConnectionStatus('disconnected');
      const message =
        error instanceof Error ? error.message : 'Falha ao testar a conexão.';
      setStatusMessage(message);
      if (showToast) toast.error(message);
    } finally {
      setTesting(false);
    }
  }, []);

  const loadConfig = useCallback(
    async (currentAccountId: string) => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('whatsapp_config')
          .select('*')
          .eq('account_id', currentAccountId)
          .maybeSingle();
        if (error) throw error;
        hydrate(data as WhatsAppConfigType | null);
        if (data) await testConnection(false);
        else {
          setConnectionStatus('disconnected');
          setStatusMessage(
            'Escolha um provedor e salve as credenciais para começar.'
          );
        }
      } catch (error) {
        console.error('Falha ao carregar a configuração:', error);
        toast.error('Não foi possível carregar a configuração do WhatsApp.');
      } finally {
        setLoading(false);
      }
    },
    [hydrate, supabase, testConnection]
  );

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountRef.current === accountId) return;
    loadedAccountRef.current = accountId;
    void loadConfig(accountId);
  }, [accountId, authLoading, loadConfig, profileLoading, user]);

  async function handleSave() {
    if (provider === 'meta' && !phoneNumberId.trim()) {
      toast.error('Informe o ID do número de telefone da Meta.');
      return;
    }
    if (provider === 'uazapi' && !uazapiBaseUrl.trim()) {
      toast.error('Informe a URL base da UAZAPI.');
      return;
    }
    if (!tokenEdited || !accessToken.trim() || accessToken === MASKED_TOKEN) {
      toast.error('Digite novamente o token para salvar as alterações.');
      return;
    }

    setSaving(true);
    try {
      const payload =
        provider === 'uazapi'
          ? {
              provider,
              uazapi_base_url: uazapiBaseUrl.trim(),
              access_token: accessToken.trim(),
            }
          : {
              provider,
              phone_number_id: phoneNumberId.trim(),
              waba_id: wabaId.trim() || null,
              access_token: accessToken.trim(),
              verify_token: verifyToken.trim() || null,
              pin: pin.trim() || null,
            };
      const response = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Não foi possível salvar.');

      toast.success(
        provider === 'uazapi'
          ? 'UAZAPI validada e salva. Agora conecte o número.'
          : 'Configuração da Meta salva com sucesso.'
      );
      if (accountId) await loadConfig(accountId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível salvar.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectUazapi() {
    if (!config || config.provider !== 'uazapi') {
      toast.error('Salve as credenciais da UAZAPI antes de conectar o número.');
      return;
    }
    setConnecting(true);
    setConnectResult(null);
    try {
      const response = await fetch('/api/whatsapp/uazapi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pairingPhone.trim() || undefined }),
      });
      const result = (await response.json()) as ConnectResult;
      if (!response.ok)
        throw new Error(result.error || 'Falha ao iniciar a conexão.');
      setConnectResult(result);
      setConnectionStatus(result.connected ? 'connected' : 'connecting');
      toast.success(
        result.connected
          ? 'Número conectado.'
          : result.paircode
            ? 'Código de pareamento gerado.'
            : 'QR Code gerado. Escaneie pelo WhatsApp.'
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao conectar.'
      );
    } finally {
      setConnecting(false);
    }
  }

  async function handleReset() {
    if (!window.confirm('Excluir a configuração atual do WhatsApp?')) return;
    setResetting(true);
    try {
      const response = await fetch('/api/whatsapp/config', {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao excluir.');
      hydrate(null);
      setConnectionStatus('disconnected');
      setStatusMessage('Configuração removida.');
      toast.success('Configuração removida com sucesso.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao excluir.');
    } finally {
      setResetting(false);
    }
  }

  function copyWebhook() {
    void navigator.clipboard.writeText(metaWebhookUrl);
    toast.success('URL do webhook copiado.');
  }

  if (loading) {
    return (
      <section>
        <SettingsPanelHead
          title="Integração com WhatsApp"
          description="Conecte o Studiosp pela UAZAPI ou pela API oficial da Meta."
        />
        <div className="flex justify-center py-16">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      </section>
    );
  }

  const qrCode = connectResult?.qrcode
    ? connectResult.qrcode.startsWith('data:')
      ? connectResult.qrcode
      : `data:image/png;base64,${connectResult.qrcode}`
    : null;

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Integração com WhatsApp"
        description="Conecte o Studiosp pela UAZAPI ou pela API oficial da Meta."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Alert>
            {connectionStatus === 'connected' ? (
              <CheckCircle2 className="size-4 text-emerald-500" />
            ) : connectionStatus === 'connecting' ? (
              <Loader2 className="size-4 animate-spin text-amber-500" />
            ) : (
              <Unplug className="text-muted-foreground size-4" />
            )}
            <AlertTitle>
              {connectionStatus === 'connected'
                ? 'Conectado'
                : connectionStatus === 'connecting'
                  ? 'Aguardando pareamento'
                  : 'Não conectado'}
            </AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Provedor do WhatsApp</CardTitle>
              <CardDescription>
                A UAZAPI é a opçãA UAZAPI é uma opção principal do Studiosp. A
                Meta permanece disponível como alternativa oficial.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={provider}
                onValueChange={(value) => setProvider(value as Provider)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uazapi">UAZAPI (não oficial)</SelectItem>
                  <SelectItem value="meta">API Meta Cloud (oficial)</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {provider === 'uazapi'
                  ? 'Credenciais da UAZAPI'
                  : 'Credenciais da Meta'}
              </CardTitle>
              <CardDescription>
                Os tokens são criptografados no servidor antes de serem
                armazenados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {provider === 'uazapi' ? (
                <div className="space-y-2">
                  <Label htmlFor="uazapi-url">URL base da UAZAPI</Label>
                  <Input
                    id="uazapi-url"
                    type="url"
                    placeholder="https://sua-instancia.uazapi.com"
                    value={uazapiBaseUrl}
                    onChange={(event) => setUazapiBaseUrl(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Use a URL HTTPS inforUse uma URL HTTPS informada no painel
                    da UAZAPI, sem caminho adicional.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="phone-number-id">
                      ID do número de telefone
                    </Label>
                    <Input
                      id="phone-number-id"
                      placeholder="Ex.: 100234567890123"
                      value={phoneNumberId}
                      onChange={(event) => setPhoneNumberId(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="waba-id">
                      ID da conta empresarial (WABA)
                    </Label>
                    <Input
                      id="waba-id"
                      placeholder="Ex.: 100234567890456"
                      value={wabaId}
                      onChange={(event) => setWabaId(event.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="whatsapp-token">
                  {provider === 'uazapi'
                    ? 'Token da instância'
                    : 'Token de acesso'}
                </Label>
                <div className="relative">
                  <Input
                    id="whatsapp-token"
                    type={showToken ? 'text' : 'password'}
                    placeholder="Cole o token aqui"
                    value={accessToken}
                    onFocus={() => {
                      if (accessToken === MASKED_TOKEN) {
                        setAccessToken('');
                        setTokenEdited(true);
                      }
                    }}
                    onChange={(event) => {
                      setAccessToken(event.target.value);
                      setTokenEdited(true);
                    }}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                    onClick={() => setShowToken((value) => !value)}
                    className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
                  >
                    {showToken ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {provider === 'meta' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="verify-token">
                      Token de verificação do webhook
                    </Label>
                    <Input
                      id="verify-token"
                      placeholder="Crie uma sequência aleatória"
                      value={verifyToken}
                      onChange={(event) => setVerifyToken(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pin">PIN de duas etapas (opcional)</Label>
                    <Input
                      id="pin"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={pin}
                      onChange={(event) =>
                        setPin(
                          event.target.value.replace(/\D/g, '').slice(0, 6)
                        )
                      }
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {provider === 'uazapi' && config?.provider === 'uazapi' && (
            <Card>
              <CardHeader>
                <CardTitle>Conectar o número</CardTitle>
                <CardDescription>
                  Deixe o número vazio para usar QR Code ou informe DDI e DDD
                  para gerar um código de pareamento.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    inputMode="tel"
                    placeholder="5511999999999 (opcional)"
                    value={pairingPhone}
                    onChange={(event) => setPairingPhone(event.target.value)}
                  />
                  <Button onClick={handleConnectUazapi} disabled={connecting}>
                    {connecting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <QrCode className="size-4" />
                    )}
                    Gerar conexão
                  </Button>
                </div>

                {qrCode && (
                  <div className="rounded-lg border bg-white p-4 text-center">
                    {/* A UAZAPI entrega o QR como data URL/base64 dinâmico. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrCode}
                      alt="QR Code para conectar o WhatsApp"
                      className="mx-auto size-64 max-w-full"
                    />
                    <p className="mt-3 text-sm text-zinc-700">
                      WhatsApp → Aparelhos conectados → Conectar aparelho
                    </p>
                  </div>
                )}

                {connectResult?.paircode && (
                  <Alert>
                    <QrCode className="size-4" />
                    <AlertTitle>Código de pareamento</AlertTitle>
                    <AlertDescription>
                      <code className="text-lg font-semibold tracking-wider">
                        {connectResult.paircode}
                      </code>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {provider === 'meta' && (
            <Card>
              <CardHeader>
                <CardTitle>URL do webhook da Meta</CardTitle>
                <CardDescription>
                  Cadastre esta URL na configuração de webhooks do aplicativo
                  Meta.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Input
                  readOnly
                  value={metaWebhookUrl}
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={copyWebhook}>
                  <Copy className="size-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salvar configuração
            </Button>
            <Button
              variant="outline"
              onClick={() => void testConnection(true)}
              disabled={testing || !config}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4" />
              )}
              Testar conexão
            </Button>
            {config && (
              <Button
                variant="destructive"
                onClick={handleReset}
                disabled={resetting}
              >
                {resetting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Remover configuração
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como funciona</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4 text-sm">
              {provider === 'uazapi' ? (
                <>
                  <p>
                    1. Obtenha a URL e o token de uma instância no painel da
                    UAZAPI.
                  </p>
                  <p>
                    2. Salve as credenciais e gere o QR Code ou código de
                    pareamento.
                  </p>
                  <p>
                    3. Depois do deploy, o Studiosp cadastra automaticamente o
                    webhook de mensagens.
                  </p>
                  <a
                    href="https://docs.uazapi.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1"
                  >
                    <ExternalLink className="size-3.5" />
                    Abrir documentação daAbrir documentação da UAZAPI
                  </a>
                </>
              ) : (
                <>
                  <p>
                    1. Crie um aplicativo empresarial no painel Meta for
                    Developers.
                  </p>
                  <p>
                    2. Adicione o produto WhatsApp e copie os identificadores e
                    o token.
                  </p>
                  <p>3. Cadastre a URL do webhook exibida ao lado.</p>
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1"
                  >
                    <ExternalLink className="size-3.5" />
                    Abrir documentação daAbrir documentação do Meta
                  </a>
                </>
              )}
            </CardContent>
          </Card>

          {provider === 'uazapi' && (
            <Alert className="border-amber-500/40 bg-amber-500/5">
              <AlertTriangle className="size-4 text-amber-500" />
              <AlertTitle>Integração não oficial</AlertTitle>
              <AlertDescription>
                A UAZAPI usa uma conexão não oficial com o WhatsApp. Utilize um
                número empresarial dedicado e evite disparos agressivos para
                reduzir o risco de bloqueio.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </section>
  );
}
