'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Pencil,
  RefreshCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PageHeader } from './page-header';
import { ErrorState, LoadingState } from './operational-state';

type Campaign = {
  id: string;
  name: string;
  status: string;
  objective_segment: string;
  entry_value_min: number | null;
  entry_value_max: number | null;
  cadence: { day: number }[];
  activated_at: string | null;
  reactivation_leads: { id: string; status: string }[];
  reactivation_touches: { id: string; status: string; step_number: number }[];
};
type PreviewRow = {
  rowNumber: number;
  name: string | null;
  phoneE164: string | null;
  email: string | null;
  objective: 'live' | 'invest' | 'both' | 'unknown';
  entryValue: number | null;
  notes: string[];
};
type CampaignLogEntry = {
  id: string;
  step_number: number;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  message_id: string | null;
  attempt_count: number;
  last_error: string | null;
  lead: {
    name: string | null;
    phone_e164: string;
    status: string;
  } | null;
};
type CampaignLogs = {
  campaign: Pick<Campaign, 'id' | 'name' | 'status'>;
  summary: {
    total: number;
    sent: number;
    scheduled: number;
    processing: number;
    failed: number;
    errors: number;
    cancelled: number;
    retried: number;
  };
  entries: CampaignLogEntry[];
};

const objectiveLabel = {
  live: 'Moradia',
  invest: 'Investimento',
  both: 'Moradia ou investimento',
  unknown: 'Não informado',
};

export function ReactivationPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editObjective, setEditObjective] = useState('all');
  const [editMin, setEditMin] = useState('');
  const [editMax, setEditMax] = useState('');
  const [editCadenceDays, setEditCadenceDays] = useState('0, 2, 5, 9');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [logs, setLogs] = useState<CampaignLogs | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(
      `/api/studiosp/reactivation?includeArchived=${includeArchived}`
    );
    const payload = await response.json();
    if (response.ok) setCampaigns(payload.campaigns);
    else setError(payload.error || 'Não foi possível carregar as campanhas.');
    setLoading(false);
  }, [includeArchived]);

  useEffect(() => {
    // Carregamento inicial sincroniza a tela com o backend.
    void load();
  }, [load]);

  const summary = useMemo(() => {
    if (!preview) return null;
    return {
      valid: preview.filter((row) => row.phoneE164).length,
      invalid: preview.filter((row) => !row.phoneE164).length,
      incomplete: preview.filter((row) => row.notes.length > 0).length,
    };
  }, [preview]);

  const send = async (mode: 'preview' | 'import') => {
    const form = formRef.current;
    if (!form?.reportValidity()) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const data = new FormData(form);
      data.set('mode', mode);
      const response = await fetch('/api/studiosp/reactivation', {
        method: 'POST',
        body: data,
      });
      const payload = await response
        .json()
        .catch(() => ({ error: 'O servidor retornou uma resposta inválida.' }));
      if (!response.ok) {
        setError(payload.error || 'Falha ao processar a planilha.');
        requestAnimationFrame(() =>
          feedbackRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          })
        );
      } else if (mode === 'preview') {
        setPreview(payload.rows);
        setPreviewTotal(payload.total);
      } else {
        form.reset();
        setPreview(null);
        setPreviewTotal(0);
        setSuccess(
          `Campanha criada como rascunho com ${payload.imported} lead${payload.imported === 1 ? '' : 's'}.`
        );
        await load();
        requestAnimationFrame(() =>
          feedbackRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          })
        );
      }
    } catch {
      setError(
        'Não foi possível concluir a importação. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setSending(false);
    }
  };

  const campaignAction = async (
    id: string,
    action: 'activate' | 'pause' | 'resume' | 'cancel' | 'archive'
  ) => {
    setSending(true);
    setError(null);
    const response = await fetch(
      `/api/studiosp/reactivation/${id}${action === 'activate' ? '/activate' : ''}`,
      action === 'activate'
        ? { method: 'POST' }
        : {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          }
    );
    const payload = await response.json();
    if (!response.ok) {
      const failureDetails = Array.isArray(payload.failures)
        ? payload.failures.filter(Boolean).join(' ')
        : '';
      setError(
        [
          payload.error || 'Não foi possível alterar a campanha.',
          failureDetails,
        ]
          .filter(Boolean)
          .join(' ')
      );
    } else if (
      Array.isArray(payload.deliveryFailures) &&
      payload.deliveryFailures.length
    ) {
      setError(
        payload.deliveryFailures
          .map((failure: { step_number?: number; last_error?: string }) => {
            const campaign = campaigns.find((item) => item.id === id);
            const cadenceDay =
              campaign?.cadence?.[
                Math.max(0, Number(failure.step_number ?? 1) - 1)
              ]?.day ?? 0;
            return `D${cadenceDay}: ${failure.last_error || 'falha no envio'}`;
          })
          .join(' ')
      );
    } else if (action === 'activate' || action === 'resume') {
      setSuccess(
        payload.sent > 0
          ? `${payload.sent} mensagem inicial enviada com sucesso.`
          : 'Campanha preparada. Não havia mensagem vencida para envio imediato.'
      );
    }
    await load();
    setSending(false);
  };

  const archiveCampaign = async (campaign: Campaign) => {
    if (
      !window.confirm(
        `Arquivar “${campaign.name}”? O histórico e os logs serão preservados.`
      )
    )
      return;
    await campaignAction(campaign.id, 'archive');
    setSuccess('Campanha arquivada. O histórico continua disponível.');
  };

  const openLogs = async (campaign: Campaign) => {
    setLogsOpen(true);
    setLogsLoading(true);
    setLogs(null);
    setError(null);
    try {
      const response = await fetch(`/api/studiosp/reactivation/${campaign.id}`);
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error || 'Não foi possível analisar os logs da campanha.'
        );
      setLogs(payload);
    } catch (logError) {
      setLogsOpen(false);
      setError(
        logError instanceof Error
          ? logError.message
          : 'Não foi possível analisar os logs da campanha.'
      );
    } finally {
      setLogsLoading(false);
    }
  };

  const startEditing = (campaign: Campaign) => {
    setEditingId(campaign.id);
    setEditName(campaign.name);
    setEditObjective(campaign.objective_segment);
    setEditMin(
      campaign.entry_value_min == null ? '' : String(campaign.entry_value_min)
    );
    setEditMax(
      campaign.entry_value_max == null ? '' : String(campaign.entry_value_max)
    );
    setEditCadenceDays(
      (campaign.cadence?.length
        ? campaign.cadence
        : [{ day: 0 }, { day: 2 }, { day: 5 }, { day: 9 }]
      )
        .map((step) => step.day)
        .join(', ')
    );
  };

  const saveCampaign = async (id: string) => {
    setSending(true);
    setError(null);
    const response = await fetch(`/api/studiosp/reactivation/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        objectiveSegment: editObjective,
        entryValueMin: editMin,
        entryValueMax: editMax,
        cadence: editCadenceDays,
      }),
    });
    const payload = await response.json();
    if (!response.ok)
      setError(payload.error || 'Não foi possível atualizar a campanha.');
    else {
      setEditingId(null);
      setSuccess('Campanha atualizada.');
      await load();
    }
    setSending(false);
  };

  const deleteCampaign = async (campaign: Campaign) => {
    if (
      !window.confirm(
        `Excluir o rascunho “${campaign.name}” e todos os leads importados nele?`
      )
    )
      return;
    setSending(true);
    setError(null);
    const response = await fetch(`/api/studiosp/reactivation/${campaign.id}`, {
      method: 'DELETE',
    });
    const payload = await response.json();
    if (!response.ok)
      setError(payload.error || 'Não foi possível excluir a campanha.');
    else {
      setSuccess('Campanha excluída.');
      await load();
    }
    setSending(false);
  };

  if (loading && !campaigns.length)
    return <LoadingState label="Carregando campanhas..." />;
  if (error && !campaigns.length)
    return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recuperação"
        title="Reativação de base"
        description="Importe contatos antigos, confira o que o sistema entendeu e só então crie uma campanha em rascunho."
      />

      <form
        ref={formRef}
        onSubmit={(event) => event.preventDefault()}
        className="border-border bg-card grid gap-4 rounded-xl border p-5 lg:grid-cols-2"
      >
        <div className="lg:col-span-2">
          <h3 className="font-semibold">1. Arquivo e segmentação</h3>
          <p className="text-muted-foreground text-sm">
            Nada será enviado antes da revisão e ativação pelo dono.
          </p>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Nome da campanha</span>
          <Input
            name="name"
            minLength={3}
            placeholder="Opcional — usaremos o nome do arquivo"
            onChange={() => setPreview(null)}
          />
        </label>
        <select
          name="objective"
          onChange={() => setPreview(null)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="all">Todos os objetivos</option>
          <option value="live">Somente moradia</option>
          <option value="invest">Somente investimento</option>
          <option value="unknown">Objetivo não informado</option>
        </select>
        <Input
          name="entryMin"
          type="number"
          min="0"
          step=".01"
          placeholder="Entrada mínima (opcional)"
          onChange={() => setPreview(null)}
        />
        <Input
          name="entryMax"
          type="number"
          min="0"
          step=".01"
          placeholder="Entrada máxima (opcional)"
          onChange={() => setPreview(null)}
        />
        <label className="space-y-1 text-sm lg:col-span-2">
          <span className="font-medium">Cadência de contatos</span>
          <Input
            name="cadenceDays"
            defaultValue="0, 2, 5, 9"
            placeholder="Ex.: 0, 2, 5, 9"
            onChange={() => setPreview(null)}
          />
          <span className="text-muted-foreground text-xs">
            Informe de 1 a 4 dias, separados por vírgula. D0 é obrigatório e
            envia a abordagem inicial; os demais são lembretes automáticos.
          </span>
        </label>
        <Input
          name="file"
          type="file"
          required
          accept=".csv,.xlsx"
          className="lg:col-span-2"
          onChange={() => setPreview(null)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={sending}
          onClick={() => void send('preview')}
          className="lg:col-span-2"
        >
          <FileSpreadsheet className="size-4" />
          {sending ? 'Analisando...' : 'Analisar planilha'}
        </Button>
      </form>

      <div ref={feedbackRef} aria-live="polite">
        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
            <p className="font-medium">A importação não foi concluída.</p>
            <p>{error}</p>
          </div>
        ) : null}
        {success ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-700">
            <p className="font-medium">Operação concluída.</p>
            <p>{success}</p>
          </div>
        ) : null}
      </div>

      {preview && summary ? (
        <section className="border-border bg-card space-y-4 rounded-xl border p-5">
          <div>
            <h3 className="font-semibold">2. Revisar importação</h3>
            <p className="text-muted-foreground text-sm">
              Exibindo até 200 de {previewTotal} linhas. Registros sem telefone
              válido não serão importados.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Números válidos" value={summary.valid} success />
            <Summary label="Linhas inválidas" value={summary.invalid} />
            <Summary label="Dados incompletos" value={summary.incomplete} />
          </div>
          <div className="border-border max-h-96 overflow-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-3">Linha</th>
                  <th className="p-3">Nome</th>
                  <th className="p-3">Número</th>
                  <th className="p-3">Objetivo</th>
                  <th className="p-3">Entrada</th>
                  <th className="p-3">Validação</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {preview.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="p-3">{row.rowNumber}</td>
                    <td className="p-3">{row.name || 'Não informado'}</td>
                    <td className="p-3">{row.phoneE164 || 'Inválido'}</td>
                    <td className="p-3">{objectiveLabel[row.objective]}</td>
                    <td className="p-3">
                      {row.entryValue == null
                        ? 'Não informado'
                        : row.entryValue.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                    </td>
                    <td className="p-3">
                      {row.notes.length ? (
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="size-3.5" />
                          {row.notes.join(' ')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="size-3.5" /> Completo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            disabled={sending || summary.valid === 0}
            onClick={() => void send('import')}
          >
            {sending ? 'Criando campanha...' : 'Confirmar e criar rascunho'}
          </Button>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Campanhas</h3>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
                className="size-4"
              />
              Exibir arquivadas
            </label>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCcw className="size-4" /> Atualizar
            </Button>
          </div>
        </div>
        {campaigns.length ? (
          campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="border-border bg-card flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                {editingId === campaign.id ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={editName}
                      minLength={3}
                      maxLength={120}
                      aria-label="Nome da campanha"
                      onChange={(event) => setEditName(event.target.value)}
                    />
                    <select
                      value={editObjective}
                      aria-label="Objetivo da campanha"
                      onChange={(event) => setEditObjective(event.target.value)}
                      className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                    >
                      <option value="all">Todos os objetivos</option>
                      <option value="live">Somente moradia</option>
                      <option value="invest">Somente investimento</option>
                      <option value="unknown">Objetivo não informado</option>
                    </select>
                    <Input
                      value={editMin}
                      type="number"
                      min="0"
                      step=".01"
                      placeholder="Entrada mínima"
                      onChange={(event) => setEditMin(event.target.value)}
                    />
                    <Input
                      value={editMax}
                      type="number"
                      min="0"
                      step=".01"
                      placeholder="Entrada máxima"
                      onChange={(event) => setEditMax(event.target.value)}
                    />
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="font-medium">Dias da cadência</span>
                      <Input
                        value={editCadenceDays}
                        aria-label="Dias da cadência"
                        placeholder="0, 2, 5, 9"
                        onChange={(event) =>
                          setEditCadenceDays(event.target.value)
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <p className="font-medium">{campaign.name}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  {campaign.reactivation_leads?.length ?? 0} leads ·{' '}
                  {campaign.objective_segment === 'all'
                    ? 'todos os objetivos'
                    : objectiveLabel[
                        campaign.objective_segment as keyof typeof objectiveLabel
                      ]}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {campaign.reactivation_touches?.filter(
                    (touch) => touch.status === 'sent'
                  ).length ?? 0}{' '}
                  mensagens enviadas ·{' '}
                  {campaign.reactivation_leads?.filter(
                    (lead) => lead.status === 'replied'
                  ).length ?? 0}{' '}
                  respostas
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Cadência:{' '}
                  {(campaign.cadence?.length
                    ? campaign.cadence
                    : [{ day: 0 }, { day: 2 }, { day: 5 }, { day: 9 }]
                  )
                    .map((step) => `D${step.day}`)
                    .join(' → ')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-muted h-fit rounded-full px-3 py-1 text-xs">
                  {campaign.status === 'draft'
                    ? 'Aguardando revisão'
                    : campaign.status === 'active'
                      ? 'Ativa'
                      : campaign.status === 'paused'
                        ? 'Pausada'
                        : campaign.status === 'cancelled'
                          ? 'Cancelada'
                          : campaign.status === 'completed'
                            ? 'Concluída'
                            : campaign.status === 'archived'
                              ? 'Arquivada'
                              : campaign.status}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sending}
                  onClick={() => void openLogs(campaign)}
                >
                  <BarChart3 className="size-4" /> Analisar logs
                </Button>
                {editingId === campaign.id ? (
                  <>
                    <Button
                      size="sm"
                      disabled={sending || editName.trim().length < 3}
                      onClick={() => void saveCampaign(campaign.id)}
                    >
                      <Save className="size-4" /> Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sending}
                      onClick={() => setEditingId(null)}
                    >
                      <X className="size-4" /> Cancelar edição
                    </Button>
                  </>
                ) : campaign.status === 'draft' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sending}
                      onClick={() => startEditing(campaign)}
                    >
                      <Pencil className="size-4" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sending}
                      onClick={() => void deleteCampaign(campaign)}
                    >
                      <Trash2 className="size-4" /> Excluir
                    </Button>
                    <Button
                      size="sm"
                      disabled={sending}
                      onClick={() =>
                        void campaignAction(campaign.id, 'activate')
                      }
                    >
                      Ativar campanha
                    </Button>
                  </>
                ) : campaign.status === 'active' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sending}
                      onClick={() => void campaignAction(campaign.id, 'pause')}
                    >
                      Pausar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sending}
                      onClick={() => void campaignAction(campaign.id, 'cancel')}
                    >
                      Cancelar campanha
                    </Button>
                  </>
                ) : campaign.status === 'paused' ? (
                  <>
                    <Button
                      size="sm"
                      disabled={sending}
                      onClick={() => void campaignAction(campaign.id, 'resume')}
                    >
                      Retomar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sending}
                      onClick={() => void campaignAction(campaign.id, 'cancel')}
                    >
                      Cancelar campanha
                    </Button>
                  </>
                ) : ['cancelled', 'completed'].includes(campaign.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sending}
                    onClick={() => void archiveCampaign(campaign)}
                  >
                    <Archive className="size-4" /> Arquivar
                  </Button>
                ) : null}
                {campaign.status === 'draft' && editingId !== campaign.id ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sending}
                    onClick={() => void archiveCampaign(campaign)}
                  >
                    <Archive className="size-4" /> Arquivar
                  </Button>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            Nenhuma campanha importada.
          </p>
        )}
      </section>

      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Logs da campanha{logs ? ` — ${logs.campaign.name}` : ''}
            </DialogTitle>
            <DialogDescription>
              Diagnóstico das tentativas de envio. O ID identifica o aceite do
              provedor; entrega e leitura dependem dos webhooks.
            </DialogDescription>
          </DialogHeader>
          {logsLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              Analisando mensagens...
            </div>
          ) : logs ? (
            <div className="space-y-4 overflow-hidden">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Summary label="Enviadas" value={logs.summary.sent} success />
                <Summary
                  label="Com erro registrado"
                  value={logs.summary.errors}
                />
                <Summary label="Agendadas" value={logs.summary.scheduled} />
                <Summary label="Reprocessadas" value={logs.summary.retried} />
                <Summary label="Processando" value={logs.summary.processing} />
                <Summary label="Canceladas" value={logs.summary.cancelled} />
                <Summary label="Total" value={logs.summary.total} />
              </div>
              <div className="border-border max-h-[48vh] overflow-auto rounded-lg border">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-3">Lead</th>
                      <th className="p-3">Etapa</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Tentativas</th>
                      <th className="p-3">Horário</th>
                      <th className="p-3">ID da mensagem/erro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {logs.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="p-3">
                          <p className="font-medium">
                            {entry.lead?.name || 'Sem nome'}
                          </p>
                          <p className="text-muted-foreground">
                            {entry.lead?.phone_e164 || 'Sem número'}
                          </p>
                        </td>
                        <td className="p-3">D{entry.step_number - 1}</td>
                        <td className="p-3">
                          {touchStatusLabel(entry.status)}
                        </td>
                        <td className="p-3">{entry.attempt_count}</td>
                        <td className="p-3">
                          {formatLogDate(entry.sent_at || entry.scheduled_for)}
                        </td>
                        <td className="max-w-xs p-3 break-words">
                          {entry.message_id || entry.last_error || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function touchStatusLabel(status: string) {
  return (
    {
      sent: 'Enviada',
      scheduled: 'Agendada',
      processing: 'Processando',
      failed: 'Erro',
      cancelled: 'Cancelada',
    }[status] ?? status
  );
}

function formatLogDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function Summary({
  label,
  value,
  success = false,
}: {
  label: string;
  value: number;
  success?: boolean;
}) {
  return (
    <div className="border-border rounded-lg border p-3">
      <p className={success ? 'text-emerald-600' : 'text-foreground'}>
        <strong className="text-xl">{value}</strong>
      </p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
