'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StudiospData } from '@/lib/studiosp/types';

const REQUEST_TIMEOUT_MS = 15_000;

export function useStudiospData(view: string, id?: string, query = '') {
  const [data, setData] = useState<StudiospData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ view });
    if (id) params.set('id', id);
    new URLSearchParams(query).forEach((value, key) => params.set(key, value));
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );
    try {
      const response = await fetch(`/api/studiosp/data?${params}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = (await response.json()) as StudiospData;
      if (!response.ok)
        throw new Error(payload.error ?? 'Não foi possível carregar os dados.');
      setData(payload);
    } catch (requestError) {
      const timedOut =
        requestError instanceof DOMException &&
        requestError.name === 'AbortError';
      setError(
        timedOut
          ? 'A solicitação demorou mais que o esperado. Tente novamente.'
          : requestError instanceof Error
          ? requestError.message
          : 'Não foi possível carregar os dados.'
      );
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, [id, query, view]);

  useEffect(() => {
    // A busca inicial é o efeito externo deste hook; `reload` também fica
    // disponível para novas tentativas e mutações concluídas.
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export async function runStudiospAction(
  action: string,
  payload: Record<string, unknown>
) {
  const response = await fetch('/api/studiosp/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = (await response.json()) as {
    error?: string;
    [key: string]: unknown;
  };
  if (!response.ok)
    throw new Error(result.error ?? 'Não foi possível concluir a ação.');
  return result;
}
