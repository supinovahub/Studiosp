'use client';

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileSearch,
  LoaderCircle,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';

type BatchSummary = {
  id: string;
  title: string;
  status: string;
  source_count: number;
  completed_source_count: number;
  failed_source_count: number;
  created_at: string;
  error_message?: string | null;
};

type BatchDetail = {
  batch: BatchSummary;
  sources: Array<{
    id: string;
    status: string;
    original_filename: string;
    pii_status: string;
    pii_count: number;
    pii_categories: string[];
    error_message?: string | null;
  }>;
  items: Array<{
    id: string;
    item_type: string;
    proposed_action: string;
    display_name: string;
    confidence: number;
    decision: string;
    target_id?: string | null;
    fields: Array<{
      id: string;
      field_name: string;
      proposed_value: unknown;
      confidence: number;
      provenance: Array<{
        page_number?: number | null;
        sanitized_excerpt?: string | null;
      }>;
    }>;
  }>;
  issues: Array<{
    id: string;
    severity: string;
    message: string;
  }>;
};

const ACTIVE_STATES = new Set([
  'awaiting',
  'extracting',
  'privacy_check',
  'analyzing',
  'consolidating',
]);

const STATUS_LABELS: Record<string, string> = {
  awaiting: 'Aguardando',
  extracting: 'Extraindo',
  privacy_check: 'Verificando privacidade',
  analyzing: 'Analisando',
  consolidating: 'Consolidando',
  ready: 'Preview pronto',
  failed: 'Falhou',
  cancelled: 'Cancelado',
  expired: 'Expirado',
};

const FIELD_LABELS: Record<string, string> = {
  developer_name: 'Incorporadora',
  name: 'Nome',
  address: 'Endereço',
  neighborhood: 'Bairro',
  city: 'Cidade',
  property_timing: 'Situação do imóvel',
  expected_delivery_date: 'Previsão de entrega',
  highlights: 'Destaques',
  knowledge_notes: 'Informações para a IA',
  label: 'Opção comercial',
  area_min_sqm: 'Área mínima',
  area_max_sqm: 'Área máxima',
  price_from: 'Preço a partir de',
  entry_from: 'Entrada a partir de',
  installment_from: 'Parcela a partir de',
  terms_summary: 'Condições comerciais',
  valid_until: 'Válido até',
  is_active: 'Ativo',
};

export function DocumentAnalysisPanel({
  onApproved,
}: {
  onApproved?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [selected, setSelected] = useState<BatchDetail | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [linksText, setLinksText] = useState('');
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !approving) {
        setConfirmingApproval(false);
        setOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [approving, open]);

  const loadBatches = useCallback(async () => {
    const response = await fetch('/api/studiosp/document-analysis', {
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error ?? 'Falha ao carregar lotes.');
    setBatches(payload.batches ?? []);
  }, []);

  const loadBatch = useCallback(async (id: string) => {
    const response = await fetch(
      `/api/studiosp/document-analysis?id=${encodeURIComponent(id)}`,
      { cache: 'no-store' }
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error ?? 'Falha ao carregar lote.');
    setSelected(payload);
    return payload as BatchDetail;
  }, []);

  const processBatch = useCallback(
    async (id: string) => {
      setError(null);
      const response = await fetch('/api/studiosp/document-analysis/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Não foi possível retomar o processamento.'
        );
      }
      await Promise.all([loadBatch(id), loadBatches()]);
    },
    [loadBatch, loadBatches]
  );

  useEffect(() => {
    if (!open) return;
    void loadBatches().catch((requestError) =>
      setError(requestError instanceof Error ? requestError.message : 'Falha.')
    );
  }, [loadBatches, open]);

  useEffect(() => {
    if (!open || !selected || !ACTIVE_STATES.has(selected.batch.status)) return;
    const timer = window.setInterval(() => {
      void loadBatch(selected.batch.id)
        .then(() => loadBatches())
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [loadBatch, loadBatches, open, selected]);

  async function createBatch() {
    const links = linksText
      .split(/\r?\n/)
      .map((link) => link.trim())
      .filter(Boolean);
    if (!files.length && !links.length) return;
    setBusy(true);
    setError(null);
    try {
      const descriptors = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          mimeType: file.type || mimeFromName(file.name),
          sizeBytes: file.size,
          checksumSha256: await sha256(file),
        }))
      );
      const response = await fetch('/api/studiosp/document-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Análise de ${files.length + links.length} documento(s)`,
          sources: descriptors,
          links,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? 'Não foi possível criar o lote.');

      const supabase = createClient();
      for (let index = 0; index < files.length; index++) {
        const target = payload.uploads[index];
        const result = await supabase.storage
          .from('document-analysis-quarantine')
          .uploadToSignedUrl(target.path, target.token, files[index], {
            contentType: descriptors[index].mimeType,
          });
        if (result.error)
          throw new Error(`Falha ao enviar ${files[index].name}.`);
      }

      setFiles([]);
      setLinksText('');
      if (inputRef.current) inputRef.current.value = '';
      await Promise.all([
        loadBatches(),
        loadBatch(payload.batch.id),
        fetch('/api/studiosp/document-analysis/process', { method: 'POST' }),
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível iniciar a análise.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function approveBatch() {
    if (!selected || selected.batch.status !== 'ready') return;
    setApproving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/studiosp/document-analysis/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: selected.batch.id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? 'Não foi possível aprovar o preview.');
      }
      await Promise.all([
        loadBatch(selected.batch.id),
        loadBatches(),
        onApproved?.(),
      ]);
      setSuccess(payload.message ?? 'Preview cadastrado com sucesso.');
      setConfirmingApproval(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível aprovar o preview.'
      );
    } finally {
      setApproving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Bot /> Analisar documentos com IA
      </Button>
    );
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex bg-black/60 p-0 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-analysis-title"
    >
      <section className="bg-background m-auto flex h-full w-full min-w-0 flex-col overflow-hidden shadow-2xl sm:h-[calc(100dvh-2rem)] sm:max-w-7xl sm:rounded-xl sm:border">
        <header className="border-border flex shrink-0 items-start justify-between gap-4 border-b p-4">
          <div>
            <h3
              id="document-analysis-title"
              className="text-foreground flex items-center gap-2 font-semibold"
            >
              <FileSearch className="text-primary size-5" />
              Analisar documentos com IA
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Fontes → processamento → preview. Nada é publicado ou enviado à
              base da IA sem aprovação posterior.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setConfirmingApproval(false);
              setOpen(false);
            }}
            aria-label="Fechar análise de documentos"
          >
            <X />
          </Button>
        </header>

        <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto overscroll-contain p-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4">
            <div className="border-border space-y-3 rounded-lg border p-3">
              <p className="text-foreground text-sm font-medium">1. Fontes</p>
              <Input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
                onChange={(event) =>
                  setFiles(Array.from(event.target.files ?? []))
                }
              />
              <p className="text-muted-foreground text-xs">
                Até 20 arquivos, 50 MB por arquivo e 250 MB por lote.
              </p>
              <Textarea
                value={linksText}
                onChange={(event) => setLinksText(event.target.value)}
                placeholder="Links públicos do Google Drive, um por linha"
                rows={3}
              />
              <p className="text-muted-foreground text-xs">
                Aceita arquivos, Documentos e Planilhas Google compartilhados
                para leitura.
              </p>
              <Button
                onClick={createBatch}
                disabled={(!files.length && !linksText.trim()) || busy}
                className="w-full"
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Bot />}
                {busy ? 'Preparando lote...' : 'Analisar arquivos'}
              </Button>
            </div>

            <div className="border-border rounded-lg border">
              <p className="border-border border-b px-3 py-2 text-sm font-medium">
                Lotes recentes
              </p>
              <div className="max-h-80 space-y-1 overflow-auto p-2">
                {batches.length ? (
                  batches.map((batch) => (
                    <button
                      type="button"
                      key={batch.id}
                      onClick={() => void loadBatch(batch.id)}
                      className="hover:bg-muted w-full rounded-md p-2 text-left"
                    >
                      <span className="text-foreground block truncate text-sm">
                        {batch.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {STATUS_LABELS[batch.status] ?? batch.status} ·{' '}
                        {batch.completed_source_count}/{batch.source_count}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-muted-foreground p-2 text-xs">
                    Nenhum lote criado.
                  </p>
                )}
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            {error ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-600">
                {success}
              </div>
            ) : null}
            {!selected ? (
              <div className="border-border text-muted-foreground flex min-h-64 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm">
                Crie ou selecione um lote para acompanhar o processamento.
              </div>
            ) : (
              <>
                <div className="border-border rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-foreground font-medium">
                        2. Processamento
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {STATUS_LABELS[selected.batch.status] ??
                          selected.batch.status}
                      </p>
                    </div>
                    {ACTIVE_STATES.has(selected.batch.status) ? (
                      <LoaderCircle className="text-primary size-5 animate-spin" />
                    ) : selected.batch.status === 'ready' ? (
                      <CheckCircle2 className="size-5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="text-destructive size-5" />
                    )}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {selected.sources.map((source) => (
                      <li
                        key={source.id}
                        className="bg-muted/40 rounded-md px-3 py-2 text-sm"
                      >
                        <span className="text-foreground">
                          {source.original_filename}
                        </span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {STATUS_LABELS[source.status] ?? source.status}
                        </span>
                        {source.pii_status === 'blocked' ? (
                          <p className="mt-1 flex items-center gap-1 text-xs text-amber-500">
                            <ShieldCheck className="size-3.5" />
                            Bloqueado por dados pessoais; nada foi enviado ao
                            provedor externo.
                          </p>
                        ) : null}
                        {source.error_message ? (
                          <p className="text-destructive mt-1 text-xs">
                            {source.error_message}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {ACTIVE_STATES.has(selected.batch.status) ||
                  selected.batch.status === 'failed' ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() =>
                        void processBatch(selected.batch.id).catch(
                          (requestError) =>
                            setError(
                              requestError instanceof Error
                                ? requestError.message
                                : 'Não foi possível retomar o processamento.'
                            )
                        )
                      }
                    >
                      {selected.batch.status === 'failed'
                        ? 'Tentar novamente'
                        : 'Retomar processamento'}
                    </Button>
                  ) : null}
                </div>

                <div className="border-border rounded-lg border p-3">
                  <p className="text-foreground font-medium">3. Preview</p>
                  {selected.issues.length ? (
                    <ul className="mt-3 space-y-1">
                      {selected.issues.map((issue) => (
                        <li
                          key={issue.id}
                          className="text-muted-foreground flex gap-2 text-xs"
                        >
                          <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {selected.items.map((item) => (
                      <article
                        key={item.id}
                        className="border-border min-w-0 overflow-hidden rounded-md border p-3"
                      >
                        <div className="flex justify-between gap-2">
                          <p className="text-foreground text-sm font-medium">
                            {item.display_name}
                          </p>
                          <span className="text-muted-foreground text-xs">
                            {item.decision === 'approved'
                              ? 'Cadastrado'
                              : item.decision === 'rejected'
                                ? 'Ignorado'
                                : `${Math.round(Number(item.confidence) * 100)}%`}
                          </span>
                        </div>
                        <dl className="mt-2 grid min-w-0 gap-2 lg:grid-cols-2">
                          {item.fields.map((field) => (
                            <div
                              key={field.id}
                              className="bg-muted/40 min-w-0 overflow-hidden rounded p-2"
                            >
                              <dt className="text-muted-foreground text-xs">
                                {FIELD_LABELS[field.field_name] ??
                                  field.field_name}
                              </dt>
                              <dd className="text-foreground text-sm [overflow-wrap:anywhere]">
                                {formatValue(field.proposed_value)}
                              </dd>
                              {field.provenance?.[0] ? (
                                <p className="text-muted-foreground mt-1 text-[11px] [overflow-wrap:anywhere]">
                                  {field.provenance[0].page_number
                                    ? `Página ${field.provenance[0].page_number} · `
                                    : ''}
                                  {field.provenance[0].sanitized_excerpt}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </dl>
                      </article>
                    ))}
                    {!selected.items.length ? (
                      <p className="text-muted-foreground text-sm">
                        O preview aparecerá quando as fontes elegíveis
                        terminarem.
                      </p>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <footer className="border-border bg-background shrink-0 border-t p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] sm:p-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium">
                4. Aprovação e cadastro
              </p>
              <p className="text-muted-foreground text-xs">
                Os itens aprovados entram como rascunho e continuam invisíveis
                para corretores até serem publicados.
              </p>
            </div>
            {confirmingApproval ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <span className="text-muted-foreground text-xs">
                  Confirmar cadastro de{' '}
                  {selected?.items.filter((item) => item.decision === 'pending')
                    .length ?? 0}{' '}
                  itens?
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={approving}
                  onClick={() => setConfirmingApproval(false)}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  disabled={approving}
                  onClick={() => void approveBatch()}
                >
                  {approving ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <CheckCircle2 />
                  )}
                  {approving ? 'Cadastrando...' : 'Confirmar cadastro'}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                className="shrink-0"
                disabled={
                  approving ||
                  selected?.batch.status !== 'ready' ||
                  !selected?.items.some((item) => item.decision === 'pending')
                }
                onClick={() => setConfirmingApproval(true)}
              >
                <CheckCircle2 />
                Aprovar e cadastrar
              </Button>
            )}
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
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

function mimeFromName(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return types[extension ?? ''] ?? 'application/octet-stream';
}

function formatValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value == null) return '—';
  return JSON.stringify(value);
}
