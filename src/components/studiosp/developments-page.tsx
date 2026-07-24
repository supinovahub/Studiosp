'use client';

import {
  Archive,
  Building2,
  FileUp,
  Image as ImageIcon,
  MapPin,
  Pencil,
  Plus,
  Search,
  Send,
  WalletCards,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { runStudiospAction, useStudiospData } from '@/hooks/use-studiosp-data';
import { formatCurrencyBRL } from '@/lib/studiosp/labels';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';
import { DocumentAnalysisPanel } from './document-analysis-panel';

// O formulário recebe a projeção dinâmica do catálogo retornada pela API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function DevelopmentsPage() {
  const { data, loading, error, reload } = useStudiospData('developments');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  const canManage = data?.role === 'owner' || data?.role === 'admin';
  const developments = useMemo(() => {
    const query = search.toLocaleLowerCase('pt-BR');
    return (data?.developments ?? []).filter((item) =>
      String(item.name).toLocaleLowerCase('pt-BR').includes(query)
    );
  }, [data?.developments, search]);

  if (loading) return <LoadingState label="Carregando catálogo..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;

  async function run(
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
      return true;
    } catch (actionError) {
      setMessage({
        type: 'error',
        text:
          actionError instanceof Error
            ? actionError.message
            : 'Não foi possível salvar.',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveDevelopment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await run(
      'save_development',
      {
        id: editing?.id,
        name: form.get('name'),
        developerId: form.get('developerId'),
        neighborhoodId: form.get('neighborhoodId'),
        internalCode: form.get('internalCode'),
        description: form.get('description'),
        propertyTiming: form.get('propertyTiming'),
        expectedDeliveryDate: form.get('expectedDeliveryDate'),
        highlights: form.get('highlights'),
        knowledgeNotes: form.get('knowledgeNotes'),
        internalNotes: form.get('internalNotes'),
      },
      editing
        ? 'Empreendimento atualizado.'
        : 'Empreendimento criado como rascunho.'
    );
    if (ok) {
      setShowForm(false);
      setEditing(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base de contexto"
        title="Empreendimentos e condições comerciais"
        description={
          canManage
            ? 'Cadastre incorporadora, bairro, metragens, preços, entrada, parcelas e arquivos. A IA consulta essa base para contar oportunidades compatíveis sem recomendar uma unidade ao lead.'
            : 'Consulte os empreendimentos publicados e as condições que ajudam a preparar a conversa com o lead.'
        }
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <DocumentAnalysisPanel onApproved={reload} />
              <Button
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                <Plus /> Novo empreendimento
              </Button>
            </div>
          ) : undefined
        }
      />

      {message ? (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${message.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}
        >
          {message.text}
        </p>
      ) : null}

      {canManage ? (
        <CatalogFoundation
          data={data}
          saving={saving}
          run={run}
          onUploadResult={async (success, text) => {
            setMessage({ type: success ? 'success' : 'error', text });
            if (success) await reload();
          }}
        />
      ) : null}

      {canManage && showForm ? (
        <section className="border-primary/30 bg-card rounded-lg border">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                {editing ? 'Editar empreendimento' : 'Novo empreendimento'}
              </h3>
              <p className="text-muted-foreground text-xs">
                Informações comerciais e contexto interno para a IA
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              aria-label="Fechar formulário"
            >
              <X />
            </Button>
          </div>
          <form
            key={editing?.id ?? 'new'}
            onSubmit={saveDevelopment}
            className="grid gap-4 p-4 md:grid-cols-2"
          >
            <Field label="Nome do empreendimento">
              <Input name="name" required defaultValue={editing?.name ?? ''} />
            </Field>
            <Field label="Código interno">
              <Input
                name="internalCode"
                defaultValue={editing?.internal_code ?? ''}
              />
            </Field>
            <Field label="Incorporadora">
              <select
                name="developerId"
                required
                defaultValue={editing?.developer_id ?? ''}
                className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
              >
                <option value="">Selecione...</option>
                {(data.developers ?? []).map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {String(item.name)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bairro">
              <select
                name="neighborhoodId"
                required
                defaultValue={editing?.neighborhood_id ?? ''}
                className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
              >
                <option value="">Selecione...</option>
                {(data.neighborhoods ?? []).map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {String(item.name)} · {String(item.city)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Situação">
              <select
                name="propertyTiming"
                defaultValue={editing?.property_timing ?? 'off_plan'}
                className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
              >
                <option value="off_plan">Na planta</option>
                <option value="ready">Pronto</option>
                <option value="both">Na planta e pronto</option>
              </select>
            </Field>
            <Field label="Previsão de entrega">
              <Input
                name="expectedDeliveryDate"
                type="date"
                defaultValue={editing?.expected_delivery_date ?? ''}
              />
            </Field>
            <Field label="Descrição para o corretor" wide>
              <Textarea
                name="description"
                required
                rows={4}
                defaultValue={editing?.description ?? ''}
              />
            </Field>
            <Field label="Destaques separados por vírgula" wide>
              <Input
                name="highlights"
                defaultValue={
                  Array.isArray(editing?.highlights)
                    ? editing.highlights.join(', ')
                    : ''
                }
              />
            </Field>
            <Field label="Conhecimento que a IA pode consultar" wide>
              <Textarea
                name="knowledgeNotes"
                rows={4}
                defaultValue={editing?.knowledge_notes ?? ''}
                placeholder="Regras, diferenciais e respostas factuais sobre o empreendimento"
              />
            </Field>
            <Field label="Notas internas do dono" wide>
              <Textarea
                name="internalNotes"
                rows={3}
                defaultValue={editing?.internal_notes ?? ''}
              />
            </Field>
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar empreendimento'}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="border-border bg-card flex items-center gap-2 rounded-lg border p-3">
        <Search className="text-muted-foreground size-4" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar empreendimento"
          className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <StatusBadge
          label={`${developments.length} cadastrados`}
          tone="neutral"
        />
      </div>

      {developments.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {developments.map((development) => {
            const developer = (data.developers ?? []).find(
              (item) => item.id === development.developer_id
            );
            const neighborhood = (data.neighborhoods ?? []).find(
              (item) => item.id === development.neighborhood_id
            );
            const offers = (data.offers ?? []).filter(
              (item) => item.development_id === development.id && item.is_active
            );
            const media = (data.media ?? []).filter(
              (item) => item.development_id === development.id
            );
            return (
              <article
                key={String(development.id)}
                className="border-border bg-card overflow-hidden rounded-lg border"
              >
                <div className="border-border border-b p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="border-primary/20 bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg border">
                        <Building2 className="text-primary size-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-foreground truncate text-base font-semibold">
                          {String(development.name)}
                        </h3>
                        <p className="text-muted-foreground mt-0.5 flex items-center gap-1 truncate text-xs">
                          <MapPin className="size-3" />{' '}
                          {String(neighborhood?.name ?? 'Bairro não informado')}{' '}
                          · {String(developer?.name ?? 'Incorporadora')}
                        </p>
                      </div>
                    </div>
                    <StatusBadge
                      compact
                      label={
                        development.status === 'published'
                          ? 'Publicado'
                          : development.status === 'paused'
                            ? 'Pausado'
                            : 'Rascunho'
                      }
                      tone={
                        development.status === 'published'
                          ? 'success'
                          : 'warning'
                      }
                    />
                  </div>
                  <p className="text-muted-foreground mt-3 line-clamp-3 text-xs leading-5">
                    {String(
                      development.description ||
                        'Descrição ainda não cadastrada.'
                    )}
                  </p>
                  {development.status !== 'published' ? (
                    <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-300">
                      Invisível para corretores até publicar.
                    </p>
                  ) : null}
                </div>
                <div className="divide-border border-border bg-muted/15 grid grid-cols-2 divide-x border-b">
                  <div className="p-3">
                    <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                      Opções comerciais
                    </p>
                    <p className="text-foreground mt-1 text-lg font-semibold">
                      {offers.length}
                    </p>
                  </div>
                  <div className="p-3">
                    <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                      Arquivos
                    </p>
                    <p className="text-foreground mt-1 text-lg font-semibold">
                      {media.length}
                    </p>
                  </div>
                </div>
                {offers.length ? (
                  <div className="space-y-2 p-3">
                    {offers.map((offer) => (
                      <div
                        key={String(offer.id)}
                        className="border-border bg-muted/20 rounded-lg border p-3"
                      >
                        <div className="flex justify-between gap-2">
                          <p className="text-foreground text-xs font-medium">
                            {String(offer.label)}
                          </p>
                          <span className="text-muted-foreground text-[10px]">
                            {String(offer.area_min_sqm)}
                            {offer.area_max_sqm
                              ? `–${String(offer.area_max_sqm)}`
                              : '+'}{' '}
                            m²
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <p className="text-muted-foreground">Preço</p>
                            <p className="text-foreground font-medium">
                              {formatCurrencyBRL(offer.price_from as number)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Entrada</p>
                            <p className="text-foreground font-medium">
                              {formatCurrencyBRL(offer.entry_from as number)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Parcela</p>
                            <p className="text-foreground font-medium">
                              {formatCurrencyBRL(
                                offer.installment_from as number
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {media.length ? (
                  <div className="border-border flex flex-wrap gap-2 border-t p-3">
                    {media.map((item) => (
                      <a
                        key={String(item.id)}
                        href={`/api/studiosp/media?id=${String(item.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="border-border text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px]"
                      >
                        <ImageIcon className="size-3" /> {String(item.title)}
                      </a>
                    ))}
                  </div>
                ) : null}
                {canManage ? (
                  <div className="border-border flex flex-wrap gap-2 border-t p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(development);
                        setShowForm(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <Pencil /> Editar
                    </Button>
                    {development.status !== 'published' ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          run(
                            'publish_development',
                            { developmentId: development.id },
                            'Empreendimento publicado.'
                          )
                        }
                        disabled={saving}
                      >
                        <Send /> Publicar
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(
                          'archive_development',
                          { developmentId: development.id },
                          'Empreendimento arquivado.'
                        )
                      }
                      disabled={saving}
                    >
                      <Archive /> Arquivar
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Building2}
          title="Nenhum empreendimento cadastrado"
          description={
            canManage
              ? 'Cadastre incorporadoras e bairros acima; depois crie o primeiro empreendimento da operação.'
              : 'O dono ainda não publicou empreendimentos para consulta.'
          }
        />
      )}
    </div>
  );
}

function CatalogFoundation({
  data,
  saving,
  run,
  onUploadResult,
}: {
  data: NonNullable<ReturnType<typeof useStudiospData>['data']>;
  saving: boolean;
  run: (
    action: string,
    payload: Record<string, unknown>,
    success: string
  ) => Promise<boolean>;
  onUploadResult: (success: boolean, text: string) => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadDevelopmentId, setUploadDevelopmentId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<
    { name: string; ok: boolean; message: string }[]
  >([]);

  async function submitSimple(
    event: FormEvent<HTMLFormElement>,
    action: string,
    success: string
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    if (await run(action, payload, success)) formElement.reset();
  }

  async function uploadFiles() {
    const files = fileInput.current?.files;
    if (!files?.length || !uploadDevelopmentId) return;
    const selectedFiles = Array.from(files);
    const unsupported = selectedFiles.find(
      (file) => !/\.(jpe?g|png|webp|gif|mp4|mov|pdf|pptx?)$/i.test(file.name)
    );
    if (unsupported) {
      await onUploadResult(
        false,
        `O formato de "${unsupported.name}" não é permitido. Envie imagens JPG, PNG, WebP ou GIF; vídeos MP4 ou MOV; documentos PDF, PPT ou PPTX.`
      );
      return;
    }
    setUploading(true);
    setUploadResults([]);
    try {
      const results: { name: string; ok: boolean; message: string }[] = [];
      for (const file of selectedFiles) {
        const form = new FormData();
        form.set('file', file);
        form.set('developmentId', uploadDevelopmentId);
        form.set('title', file.name);
        form.set('visibility', 'broker');
        const response = await fetch('/api/studiosp/media', {
          method: 'POST',
          body: form,
        });
        const payload = await response.json().catch(() => ({}));
        results.push({
          name: file.name,
          ok: response.ok,
          message: response.ok
            ? 'Enviado'
            : (payload.error ?? `Falha ao enviar ${file.name}.`),
        });
      }
      setUploadResults(results);
      const successful = results.filter((item) => item.ok).length;
      const failed = results.length - successful;
      await onUploadResult(
        failed === 0,
        failed === 0
          ? `${successful} arquivo(s) enviado(s).`
          : `${successful} enviado(s) e ${failed} com falha. Confira o resultado individual.`
      );
    } catch (error) {
      await onUploadResult(
        false,
        error instanceof Error ? error.message : 'Falha no envio.'
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <details className="border-border bg-card rounded-lg border">
      <summary className="text-foreground cursor-pointer list-none px-4 py-3 text-sm font-semibold">
        Cadastros rápidos e arquivos{' '}
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          incorporadoras, bairros, opções comerciais e pasta de mídias
        </span>
      </summary>
      <div className="border-border grid gap-4 border-t p-4 lg:grid-cols-2">
        <form
          onSubmit={(event) =>
            submitSimple(event, 'save_developer', 'Incorporadora cadastrada.')
          }
          className="border-border space-y-3 rounded-lg border p-3"
        >
          <h3 className="text-foreground flex items-center gap-2 text-sm font-medium">
            <Building2 className="text-primary size-4" /> Nova incorporadora
          </h3>
          <Field label="Nome">
            <Input name="name" required />
          </Field>
          <Field label="Site">
            <Input name="websiteUrl" type="url" placeholder="https://" />
          </Field>
          <Button type="submit" size="sm" disabled={saving}>
            <Plus /> Adicionar
          </Button>
        </form>
        <form
          onSubmit={(event) =>
            submitSimple(event, 'save_neighborhood', 'Bairro cadastrado.')
          }
          className="border-border space-y-3 rounded-lg border p-3"
        >
          <h3 className="text-foreground flex items-center gap-2 text-sm font-medium">
            <MapPin className="text-primary size-4" /> Novo bairro
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bairro">
              <Input name="name" required />
            </Field>
            <Field label="Cidade">
              <Input name="city" defaultValue="São Paulo" required />
            </Field>
          </div>
          <input type="hidden" name="stateCode" value="SP" />
          <Button type="submit" size="sm" disabled={saving}>
            <Plus /> Adicionar
          </Button>
        </form>
        <form
          onSubmit={(event) =>
            submitSimple(event, 'save_offer', 'Opção comercial cadastrada.')
          }
          className="border-border space-y-3 rounded-lg border p-3 lg:col-span-2"
        >
          <h3 className="text-foreground flex items-center gap-2 text-sm font-medium">
            <WalletCards className="text-primary size-4" /> Nova opção comercial
          </h3>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Empreendimento">
              <select
                name="developmentId"
                required
                className="border-input bg-background text-foreground h-9 w-full rounded-lg border px-2 text-sm"
              >
                <option value="">Selecione...</option>
                {(data.developments ?? []).map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {String(item.name)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nome da opção">
              <Input name="label" required placeholder="Studio 30 m²" />
            </Field>
            <Field label="Metragem mínima">
              <Input
                name="areaMin"
                type="number"
                min="1"
                step="0.01"
                required
              />
            </Field>
            <Field label="Metragem máxima">
              <Input name="areaMax" type="number" min="1" step="0.01" />
            </Field>
            <Field label="Preço a partir de">
              <Input name="priceFrom" type="number" min="0" />
            </Field>
            <Field label="Entrada a partir de">
              <Input name="entryFrom" type="number" min="0" />
            </Field>
            <Field label="Parcela a partir de">
              <Input name="installmentFrom" type="number" min="0" />
            </Field>
            <Field label="Validade">
              <Input name="validUntil" type="date" />
            </Field>
          </div>
          <Field label="Resumo das condições">
            <Input
              name="termsSummary"
              placeholder="Condições médias e observações"
            />
          </Field>
          <Button type="submit" size="sm" disabled={saving}>
            <Plus /> Adicionar opção
          </Button>
        </form>
        <div className="border-border space-y-3 rounded-lg border p-3 lg:col-span-2">
          <h3 className="text-foreground flex items-center gap-2 text-sm font-medium">
            <FileUp className="text-primary size-4" /> Enviar pasta de arquivos
          </h3>
          <p className="text-muted-foreground text-xs">
            Selecione vários arquivos de uma vez. Imagens, vídeos, PDFs e
            apresentações ficam em uma biblioteca privada por empreendimento.
          </p>
          <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
            <select
              value={uploadDevelopmentId}
              onChange={(event) => setUploadDevelopmentId(event.target.value)}
              className="border-input bg-background text-foreground h-9 rounded-lg border px-2 text-sm"
            >
              <option value="">Empreendimento...</option>
              {(data.developments ?? []).map((item) => (
                <option key={String(item.id)} value={String(item.id)}>
                  {String(item.name)}
                </option>
              ))}
            </select>
            <Input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*,video/mp4,video/quicktime,application/pdf,.ppt,.pptx"
              className="h-9"
            />
            <Button
              type="button"
              onClick={uploadFiles}
              disabled={uploading || !uploadDevelopmentId}
            >
              {uploading ? 'Enviando...' : 'Enviar arquivos'}
            </Button>
          </div>
          {uploadResults.length ? (
            <ul
              className="space-y-1 text-xs"
              aria-label="Resultado dos uploads"
            >
              {uploadResults.map((result) => (
                <li
                  key={result.name}
                  className={
                    result.ok
                      ? 'text-emerald-600 dark:text-emerald-300'
                      : 'text-destructive'
                  }
                >
                  {result.name}: {result.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </details>
  );
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
