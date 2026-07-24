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

export function DocumentAnalysisPanel() {
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [selected, setSelected] = useState<BatchDetail | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [linksText, setLinksText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadBatches = useCallback(async () => {
    const response = await fetch('/api/studiosp/document-analysis', {
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Falha ao carregar lotes.');
    setBatches(payload.batches ?? []);
  }, []);

  const loadBatch = useCallback(async (id: string) => {
    const response = await fetch(
      `/api/studiosp/document-analysis?id=${encodeURIComponent(id)}`,
      { cache: 'no-store' }
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Falha ao carregar lote.');
    setSelected(payload);
    return payload as BatchDetail;
  }, []);

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
        if (result.error) throw new Error(`Falha ao enviar ${files[index].name}.`);
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

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Bot /> Analisar documentos com IA
      </Button>
    );
  }

  return (
    <section className="border-primary/30 bg-card rounded-lg border">
      <header className="border-border flex items-start justify-between gap-4 border-b p-4">
        <div>
          <h3 className="text-foreground flex items-center gap-2 font-semibold">
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
          onClick={() => setOpen(false)}
          aria-label="Fechar análise de documentos"
        >
          <X />
        </Button>
      </header>

      <div className="grid gap-4 p-4 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="border-border space-y-3 rounded-lg border p-3">
            <p className="text-foreground text-sm font-medium">1. Fontes</p>
            <Input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
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
              Aceita arquivos, Documentos e Planilhas Google compartilhados para
              leitura.
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

        <div className="space-y-4">
          {error ? (
            <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm">
              {error}
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
                      className="border-border rounded-md border p-3"
                    >
                      <div className="flex justify-between gap-2">
                        <p className="text-foreground text-sm font-medium">
                          {item.display_name}
                        </p>
                        <span className="text-muted-foreground text-xs">
                          {Math.round(Number(item.confidence) * 100)}%
                        </span>
                      </div>
                      <dl className="mt-2 grid gap-2 md:grid-cols-2">
                        {item.fields.map((field) => (
                          <div key={field.id} className="bg-muted/40 rounded p-2">
                            <dt className="text-muted-foreground text-xs">
                              {field.field_name}
                            </dt>
                            <dd className="text-foreground break-words text-sm">
                              {formatValue(field.proposed_value)}
                            </dd>
                            {field.provenance?.[0] ? (
                              <p className="text-muted-foreground mt-1 text-[11px]">
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
                      O preview aparecerá quando as fontes elegíveis terminarem.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="border-border bg-muted/30 rounded-lg border p-3">
                <p className="text-foreground font-medium">4. Aprovação</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Bloqueada nesta homologação. Nenhuma proposta deste lote pode
                  alterar o catálogo ou a base de conhecimento.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
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
