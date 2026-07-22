import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

interface Params { params: Promise<{ conversationId: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const { conversationId } = await params;
    const { supabase, accountId } = await requireRole('viewer');
    const { data, error } = await supabase
      .from('conversation_sdr_state')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ state: data ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
