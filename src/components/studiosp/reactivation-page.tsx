'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from './page-header';
import { ErrorState, LoadingState } from './operational-state';

type Campaign = {
  id: string;
  name: string;
  status: string;
  objective_segment: string;
  reactivation_leads: { id: string }[];
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

const objectiveLabel = {
  live: 'Moradia',
  invest: 'Investimento',
  both: 'Moradia ou investimento',
  unknown: 'Não informado',
};

export function ReactivationPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/studiosp/reactivation');
    const payload = await response.json();
    if (response.ok) setCampaigns(payload.campaigns);
    else setError(payload.error || 'Não foi possível carregar as campanhas.');
    setLoading(false);
  }, []);

  useEffect(() => {
    // Carregamento inicial sincroniza a tela com o backend.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const data = new FormData(form);
    data.set('mode', mode);
    const response = await fetch('/api/studiosp/reactivation', {
      method: 'POST',
      body: data,
    });
    const payload = await response.json();
    if (!response.ok)
      setError(payload.error || 'Falha ao processar a planilha.');
    else if (mode === 'preview') {
      setPreview(payload.rows);
      setPreviewTotal(payload.total);
    } else {
      form.reset();
      setPreview(null);
      setPreviewTotal(0);
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
        <Input
          name="name"
          required
          minLength={3}
          placeholder="Nome da campanha"
          onChange={() => setPreview(null)}
        />
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
        <Input
          name="file"
          type="file"
          required
          accept=".csv,.xlsx"
          className="lg:col-span-2"
          onChange={() => setPreview(null)}
        />
        {error ? (
          <p className="text-destructive text-sm lg:col-span-2">{error}</p>
        ) : null}
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
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Campanhas</h3>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCcw className="size-4" /> Atualizar
          </Button>
        </div>
        {campaigns.length ? (
          campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="border-border bg-card flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{campaign.name}</p>
                <p className="text-muted-foreground text-xs">
                  {campaign.reactivation_leads?.length ?? 0} leads ·{' '}
                  {campaign.objective_segment === 'all'
                    ? 'todos os objetivos'
                    : objectiveLabel[
                        campaign.objective_segment as keyof typeof objectiveLabel
                      ]}
                </p>
              </div>
              <span className="bg-muted h-fit rounded-full px-3 py-1 text-xs">
                {campaign.status === 'draft'
                  ? 'Aguardando revisão'
                  : campaign.status}
              </span>
            </article>
          ))
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            Nenhuma campanha importada.
          </p>
        )}
      </section>
    </div>
  );
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
