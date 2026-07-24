import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { processNextDocumentAnalysis } from '@/lib/document-analysis/worker';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    const result = await processNextDocumentAnalysis(
      supabaseAdmin(),
      ctx.accountId
    );
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
