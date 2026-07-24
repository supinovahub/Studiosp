import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { processNextDocumentAnalysis } from '@/lib/document-analysis/worker';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      batchId?: unknown;
    } | null;
    const batchId = String(body?.batchId ?? '');
    if (batchId) {
      const { data: retryBatch, error: retryError } = await ctx.supabase
        .from('document_analysis_batches')
        .update({
          status: 'awaiting',
          attempts: 0,
          error_code: null,
          error_message: null,
          completed_at: null,
          lease_token: null,
          lease_expires_at: null,
        })
        .eq('account_id', ctx.accountId)
        .eq('id', batchId)
        .eq('status', 'failed')
        .select('id')
        .maybeSingle();
      if (retryError) throw retryError;
      if (retryBatch) {
        const { error: sourcesError } = await ctx.supabase
          .from('document_analysis_sources')
          .update({
            status: 'awaiting',
            attempts: 0,
            error_code: null,
            error_message: null,
            next_attempt_at: new Date().toISOString(),
            completed_at: null,
          })
          .eq('account_id', ctx.accountId)
          .eq('batch_id', batchId)
          .eq('status', 'failed');
        if (sourcesError) throw sourcesError;
      }
    }
    const result = await processNextDocumentAnalysis(
      supabaseAdmin(),
      ctx.accountId
    );
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
