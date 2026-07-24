'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileJson2,
  History,
  LoaderCircle,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  Upload,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { createClient } from '@/lib/supabase/client';
import type {
  HistoryImportBatch,
  HistoryImportPreview,
  HistoryImportStatus,
} from '@/lib/whatsapp-history/types';
import { PageHeader } from './page-header';
import { EmptyState } from './operational-state';
import { StatusBadge } from './status-badge';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ACTIVE_STATUSES = new Set<HistoryImportStatus>([
  'uploading',
  'analyzing',
  'ready',
  'importing',
  'failed',
]);

const STATUS_LABELS: Record<HistoryImportStatus, string> = {
  uploading: 'Enviando arquivo',
  analyzing: 'Gerando prévia',
  ready: 'Aguardando confirmação',
  importing: 'Importando',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

function statusTone(status: HistoryImportStatus) {
  if (status === 'completed') return 'success' as const;
  if (status === 'failed' || status === 'cancelled') return 'danger' as const;
  if (status === 'ready') return 'warning' as const;
  if (
    status === 'uploading' ||
    status === 'analyzing' ||
    status === 'importing'
  )
    return 'primary' as const;
  return 'neutral' as const;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatBytes(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 1,
  }).format(value / 1024 / 1024);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function isPreview(
  value: HistoryImportBatch['preview']
): value is HistoryImportPreview {
  return (
    value != null &&
    typeof value === 'object' &&
    'messageCount' in value &&
    typeof value.messageCount === 'number'
  );
}

async function responsePayload(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    batch?: HistoryImportBatch;
    batches?: HistoryImportBatch[];
    upload?: { path: string; token: string };
  };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Não foi possível concluir esta etapa.');
  }
  return payload;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer()
  );
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function WhatsAppHistoryImportPage() {
  const [batches, setBatches] = useState<HistoryImportBatch[]>([]);
  const [selected, setSelected] = useState<HistoryImportBatch | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadBatches = useCallback(async (preferActive = false) => {
    const payload = await responsePayload(
      await fetch('/api/studiosp/whatsapp-history', { cache: 'no-store' })
    );
    const next = payload.batches ?? [];
    setBatches(next);
    setSelected((current) => {
      if (current) {
        return next.find((batch) => batch.id === current.id) ?? current;
      }
      if (!preferActive) return null;
      return next.find((batch) => ACTIVE_STATUSES.has(batch.status)) ?? null;
    });
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/studiosp/whatsapp-history', { cache: 'no-store' })
      .then(responsePayload)
      .then((payload) => {
        if (cancelled) return;
        const next = payload.batches ?? [];
        setBatches(next);
        setSelected(
          next.find((batch) => ACTIVE_STATUSES.has(batch.status)) ?? null
        );
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível carregar as importações.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(
    () => (selected && isPreview(selected.preview) ? selected.preview : null),
    [selected]
  );
  const progress =
    selected?.message_count && selected.message_count > 0
      ? Math.min(
          100,
          Math.round((selected.import_cursor / selected.message_count) * 100)
        )
      : 0;

  function chooseFile(next: File | null) {
    setError(null);
    setConfirmed(false);
    if (!next) {
      setFile(null);
      return;
    }
    if (!next.name.toLowerCase().endsWith('.jsonl')) {
      setError('Selecione o arquivo estruturado com extensão .jsonl.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (next.size <= 0 || next.size > MAX_FILE_BYTES) {
      setError('O arquivo JSONL precisa ter no máximo 50 MB.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFile(next);
  }

  async function uploadAndAnalyze() {
    if (!file || busyLabel) return;
    setBusyLabel('Calculando a assinatura do arquivo...');
    setError(null);
    try {
      const checksum = await sha256(file);
      setBusyLabel('Enviando o histórico para a área privada...');
      const created = await responsePayload(
        await fetch('/api/studiosp/whatsapp-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            sizeBytes: file.size,
            checksumSha256: checksum,
          }),
        })
      );
      if (!created.batch || !created.upload) {
        throw new Error('O servidor não preparou o envio do arquivo.');
      }
      setSelected(created.batch);

      const upload = await createClient()
        .storage.from('whatsapp-history-imports')
        .uploadToSignedUrl(created.upload.path, created.upload.token, file, {
          contentType: 'application/x-ndjson',
        });
      if (upload.error) throw new Error('O envio do arquivo foi interrompido.');

      setBusyLabel('Conferindo conversas e preparando a prévia...');
      const analyzed = await responsePayload(
        await fetch('/api/studiosp/whatsapp-history/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: created.batch.id }),
        })
      );
      if (!analyzed.batch) throw new Error('A prévia não foi devolvida.');
      setSelected(analyzed.batch);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await loadBatches();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível analisar o histórico.'
      );
      await loadBatches().catch(() => undefined);
    } finally {
      setBusyLabel(null);
    }
  }

  async function retryAnalysis(batch: HistoryImportBatch) {
    if (busyLabel) return;
    setBusyLabel('Retomando a validação do arquivo...');
    setError(null);
    try {
      const analyzed = await responsePayload(
        await fetch('/api/studiosp/whatsapp-history/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: batch.id }),
        })
      );
      if (!analyzed.batch) throw new Error('A prévia não foi devolvida.');
      setSelected(analyzed.batch);
      await loadBatches();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível retomar a análise.'
      );
      await loadBatches().catch(() => undefined);
    } finally {
      setBusyLabel(null);
    }
  }

  async function runImport(batch: HistoryImportBatch) {
    if (busyLabel || (batch.status === 'ready' && !confirmed)) return;
    setBusyLabel('Importando mensagens sem acionar a operação...');
    setError(null);
    try {
      let current = batch;
      let previousCursor = -1;
      while (current.status !== 'completed') {
        const payload = await responsePayload(
          await fetch('/api/studiosp/whatsapp-history/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId: current.id, confirm: true }),
          })
        );
        if (!payload.batch) throw new Error('Progresso não devolvido.');
        current = payload.batch;
        setSelected(current);
        setBatches((items) =>
          items.map((item) => (item.id === current.id ? current : item))
        );
        if (
          current.status !== 'completed' &&
          current.import_cursor <= previousCursor
        ) {
          throw new Error(
            'A importação não avançou. Use Retomar para tentar novamente.'
          );
        }
        previousCursor = current.import_cursor;
      }
      setConfirmed(false);
      await loadBatches();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'A importação foi interrompida. O progresso foi preservado.'
      );
      await loadBatches().catch(() => undefined);
    } finally {
      setBusyLabel(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WhatsApp · Segurança operacional"
        title="Importação de histórico"
        description="Traga conversas antigas para consulta no inbox sem transformar o conteúdo em instrução para a IA e sem disparar qualquer atendimento."
        actions={
          <Button variant="outline" render={<Link href="/configuracoes" />}>
            <ArrowLeft />
            Configurações
          </Button>
        }
      />

      <div className="flex gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-300" />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">
            Importação silenciosa por padrão
          </p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            O envio do arquivo nunca manda mensagens. Depois da confirmação, os
            contatos entram protegidos contra IA, fluxos, automações, follow-ups
            e criação automática de oportunidades.
          </p>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" aria-live="assertive">
          <AlertTriangle />
          <AlertTitle>Esta etapa não foi concluída</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {busyLabel ? (
        <div
          className="border-primary/30 bg-primary/5 flex items-center gap-3 rounded-lg border px-4 py-3"
          aria-live="polite"
        >
          <LoaderCircle className="text-primary size-4 animate-spin" />
          <p className="text-foreground text-sm font-medium">{busyLabel}</p>
        </div>
      ) : null}

      <section className="border-border bg-card overflow-hidden rounded-lg border">
        <div className="border-border grid border-b sm:grid-cols-3">
          {[
            ['1', 'Arquivo privado'],
            ['2', 'Prévia e validação'],
            ['3', 'Confirmação do dono'],
          ].map(([number, label], index) => {
            const active =
              (!selected && index === 0) ||
              (selected?.status === 'ready' && index === 1) ||
              (selected?.status === 'importing' && index === 2) ||
              (selected?.status === 'completed' && index === 2);
            return (
              <div
                key={number}
                className="border-border flex items-center gap-3 border-b px-4 py-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
              >
                <span
                  className={
                    active
                      ? 'bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs font-semibold'
                      : 'bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full text-xs font-semibold'
                  }
                >
                  {number}
                </span>
                <span
                  className={
                    active
                      ? 'text-foreground text-sm font-medium'
                      : 'text-muted-foreground text-sm'
                  }
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="p-4 sm:p-6">
          {!selected || selected.status === 'failed' ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0">
                <h3 className="text-foreground text-lg font-semibold">
                  Selecione a base estruturada
                </h3>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  Use o arquivo JSONL. Markdown não é necessário e o ZIP deve
                  continuar somente como backup fora do sistema.
                </p>
                <label
                  htmlFor="whatsapp-history-file"
                  className="border-border bg-background hover:border-primary/40 hover:bg-muted/20 mt-4 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center"
                >
                  <div className="border-border bg-muted/50 flex size-10 items-center justify-center rounded-lg border">
                    <Upload className="text-primary size-5" />
                  </div>
                  <span className="text-foreground mt-3 text-sm font-semibold">
                    {file ? file.name : 'Escolher arquivo JSONL'}
                  </span>
                  <span className="text-muted-foreground mt-1 text-xs">
                    {file
                      ? `${formatBytes(file.size)} · pronto para a prévia`
                      : 'Até 50 MB · o arquivo vai direto para o armazenamento privado'}
                  </span>
                </label>
                <input
                  ref={inputRef}
                  id="whatsapp-history-file"
                  type="file"
                  accept=".jsonl,application/x-ndjson,application/json,text/plain"
                  className="sr-only"
                  disabled={Boolean(busyLabel)}
                  onChange={(event) =>
                    chooseFile(event.target.files?.[0] ?? null)
                  }
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="lg"
                    disabled={!file || Boolean(busyLabel)}
                    onClick={() => void uploadAndAnalyze()}
                  >
                    <FileJson2 />
                    Enviar e gerar prévia
                  </Button>
                  {file ? (
                    <Button
                      variant="ghost"
                      size="lg"
                      disabled={Boolean(busyLabel)}
                      onClick={() => chooseFile(null)}
                    >
                      Limpar seleção
                    </Button>
                  ) : null}
                </div>
              </div>
              <aside className="border-border bg-card-2 rounded-lg border p-4">
                <p className="text-foreground text-sm font-semibold">
                  O que será validado
                </p>
                <ul className="text-muted-foreground mt-3 space-y-3 text-xs leading-5">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                    Contatos individuais, datas e direção das mensagens
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                    Linhas inválidas, eventos técnicos e IDs repetidos
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                    Assinatura do arquivo antes de cada lote importado
                  </li>
                </ul>
              </aside>
            </div>
          ) : null}

          {selected && preview && selected.status === 'ready' ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-primary text-[11px] font-semibold tracking-[0.14em] uppercase">
                    Prévia pronta
                  </p>
                  <h3
                    className="text-foreground mt-1 truncate text-lg font-semibold"
                    title={selected.original_filename}
                  >
                    {selected.original_filename}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Confira os números antes de liberar a escrita no inbox.
                  </p>
                </div>
                <StatusBadge
                  label={STATUS_LABELS[selected.status]}
                  tone={statusTone(selected.status)}
                />
              </div>

              <div className="border-border bg-background grid overflow-hidden rounded-lg border lg:grid-cols-[1.1fr_1fr]">
                <div className="border-border p-5 lg:border-r">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Conversas identificadas
                  </p>
                  <p className="text-foreground mt-2 text-4xl font-semibold tracking-tight tabular-nums">
                    {formatNumber(preview.chatCount)}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {formatNumber(preview.messageCount)} mensagens históricas
                    ficarão disponíveis para consulta.
                  </p>
                </div>
                <dl className="divide-border grid grid-cols-2 divide-x divide-y">
                  {[
                    ['Recebidas', preview.inboundCount],
                    ['Enviadas', preview.outboundCount],
                    ['Mídias sem arquivo', preview.mediaCount],
                    ['Eventos ignorados', preview.skippedEventCount],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 p-4">
                      <dt className="text-muted-foreground text-xs">{label}</dt>
                      <dd className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                        {formatNumber(Number(value))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {preview.invalidLineCount > 0 ||
              preview.duplicateEventIdCount > 0 ||
              preview.truncatedTextCount > 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
                    <div>
                      <p className="text-foreground text-sm font-semibold">
                        Pontos tratados automaticamente
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm leading-6">
                        {formatNumber(preview.invalidLineCount)} linha(s)
                        inválida(s),{' '}
                        {formatNumber(preview.duplicateEventIdCount)} ID(s)
                        repetido(s) e {formatNumber(preview.truncatedTextCount)}{' '}
                        texto(s) truncado(s). IDs repetidos são combinados com
                        conversa, data e chave para não misturar contatos.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="border-primary/25 bg-primary/5 rounded-lg border p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={confirmed}
                    onCheckedChange={(checked) =>
                      setConfirmed(Boolean(checked))
                    }
                    disabled={Boolean(busyLabel)}
                    aria-describedby="history-confirmation-help"
                    className="mt-0.5 size-5"
                  />
                  <span className="min-w-0">
                    <span className="text-foreground block text-sm font-semibold">
                      Confirmo a importação silenciosa deste histórico
                    </span>
                    <span
                      id="history-confirmation-help"
                      className="text-muted-foreground mt-1 block text-xs leading-5"
                    >
                      As mensagens ficarão visíveis, os contatos serão
                      suprimidos de ações automáticas e o JSONL bruto será
                      removido do armazenamento ao concluir.
                    </span>
                  </span>
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="lg"
                    disabled={!confirmed || Boolean(busyLabel)}
                    onClick={() => void runImport(selected)}
                  >
                    <ShieldCheck />
                    Confirmar e importar
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    disabled={Boolean(busyLabel)}
                    onClick={() => {
                      setSelected(null);
                      setConfirmed(false);
                    }}
                  >
                    Fazer depois
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {selected &&
          (selected.status === 'uploading' ||
            selected.status === 'analyzing') ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="border-primary/25 bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg border">
                  <LoaderCircle className="text-primary size-5 animate-spin" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-lg font-semibold">
                    A prévia ainda não foi concluída
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    O lote ficou salvo. Você pode retomar a conferência sem
                    criar contatos nem mensagens.
                  </p>
                </div>
                <StatusBadge
                  label={STATUS_LABELS[selected.status]}
                  tone="primary"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="lg"
                  disabled={Boolean(busyLabel)}
                  onClick={() => void retryAnalysis(selected)}
                >
                  <RefreshCcw />
                  Retomar prévia
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  disabled={Boolean(busyLabel)}
                  onClick={() => setSelected(null)}
                >
                  Começar outro lote
                </Button>
              </div>
            </div>
          ) : null}

          {selected && selected.status === 'importing' ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-primary text-[11px] font-semibold tracking-[0.14em] uppercase">
                    Progresso preservado
                  </p>
                  <h3 className="text-foreground mt-1 text-lg font-semibold">
                    Importação em andamento
                  </h3>
                </div>
                <StatusBadge label="Importando" tone="primary" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {formatNumber(selected.import_cursor)} de{' '}
                    {formatNumber(selected.message_count)} mensagens
                  </span>
                  <span className="text-foreground font-semibold tabular-nums">
                    {progress}%
                  </span>
                </div>
                <div
                  className="bg-muted h-2 overflow-hidden rounded-full"
                  role="progressbar"
                  aria-label="Progresso da importação"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="bg-primary h-full origin-left rounded-full transition-transform duration-200"
                    style={{ transform: `scaleX(${progress / 100})` }}
                  />
                </div>
              </div>
              <Button
                size="lg"
                disabled={Boolean(busyLabel)}
                onClick={() => void runImport(selected)}
              >
                <RefreshCcw />
                Retomar importação
              </Button>
            </div>
          ) : null}

          {selected && selected.status === 'completed' ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
                  <CheckCircle2 className="size-5 text-emerald-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-lg font-semibold">
                    Histórico importado com proteção ativa
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    {formatNumber(selected.imported_message_count)} mensagens
                    foram gravadas. O arquivo bruto foi removido e nenhuma
                    automação foi acionada.
                  </p>
                </div>
                <StatusBadge label="Concluída" tone="success" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button render={<Link href="/inbox" />}>
                  <MessageSquareText />
                  Abrir inbox
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(null);
                    setConfirmed(false);
                  }}
                >
                  Importar outro arquivo
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-foreground text-base font-semibold">
              Importações recentes
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Relatórios e lotes que podem ser retomados com segurança.
            </p>
          </div>
          {!loading ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatNumber(batches.length)} lote(s)
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="border-border bg-card flex min-h-32 items-center justify-center rounded-lg border">
            <LoaderCircle className="text-primary size-5 animate-spin" />
            <span className="text-muted-foreground ml-2 text-sm">
              Carregando importações...
            </span>
          </div>
        ) : batches.length ? (
          <div className="border-border bg-card divide-border divide-y overflow-hidden rounded-lg border">
            {batches.map((batch) => (
              <button
                key={batch.id}
                type="button"
                onClick={() => {
                  setSelected(batch);
                  setConfirmed(false);
                  setError(null);
                }}
                className="hover:bg-muted/25 flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="border-border bg-muted/40 flex size-9 shrink-0 items-center justify-center rounded-lg border">
                  {batch.status === 'completed' ? (
                    <History className="size-4 text-emerald-300" />
                  ) : (
                    <FileJson2 className="text-primary size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-foreground truncate text-sm font-medium"
                    title={batch.original_filename}
                  >
                    {batch.original_filename}
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                    <span>{formatDate(batch.created_at)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatNumber(batch.chat_count)} conversas</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatBytes(batch.size_bytes)}</span>
                  </p>
                </div>
                <StatusBadge
                  label={STATUS_LABELS[batch.status]}
                  tone={statusTone(batch.status)}
                  compact
                />
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="Nenhum histórico importado"
            description="Quando uma prévia for criada, o lote e seu progresso aparecerão aqui."
          />
        )}
      </section>
    </div>
  );
}
