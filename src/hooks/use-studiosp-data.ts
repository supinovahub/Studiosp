'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StudiospData } from '@/lib/studiosp/types';

export function useStudiospData(view: string, id?: string) {
  const [data, setData] = useState<StudiospData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ view });
    if (id) params.set('id', id);
    try {
      const response = await fetch(`/api/studiosp/data?${params}`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as StudiospData;
      if (!response.ok)
        throw new Error(payload.error ?? 'Não foi possível carregar os dados.');
      setData(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível carregar os dados.'
      );
    } finally {
      setLoading(false);
    }
  }, [id, view]);

  useEffect(() => {
    // A busca inicial é o efeito externo deste hook; `reload` também fica
    // disponível para novas tentativas e mutações concluídas.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
