"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

interface Snapshot {
  window_hours: number;
  total: number;
  completed: number;
  retrying: number;
  handoff: number;
  failed: number;
  skipped: number;
  queued: number;
  processing: number;
  overdue: number;
  p95_latency_ms: number;
}

export function AiReliabilityPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/ai/reliability", { cache: "no-store" });
      if (!response.ok) throw new Error("snapshot_failed");
      setSnapshot(await response.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Saúde das respostas automáticas</h3>
          <p className="text-xs text-muted-foreground">Últimas 24 horas</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Não foi possível carregar os indicadores.
        </div>
      ) : snapshot ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Respondidas" value={snapshot.completed} />
            <Metric label="Na fila/processando" value={snapshot.queued + snapshot.processing + snapshot.retrying} />
            <Metric label="Transferidas" value={snapshot.handoff} />
            <Metric label="Falhas" value={snapshot.failed} alert={snapshot.failed > 0} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {snapshot.overdue > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              {snapshot.overdue} atendimento(s) atrasado(s)
            </span>
            <span>P95: {Math.round(snapshot.p95_latency_ms / 100) / 10}s</span>
            <span>{snapshot.skipped} não elegível(is)</span>
          </div>
        </>
      ) : (
        <div className="h-20 animate-pulse rounded-md bg-muted" />
      )}
    </section>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={alert ? "text-xl font-semibold text-destructive" : "text-xl font-semibold"}>{value}</p>
    </div>
  );
}
