import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('owner');
    const { data, error } = await supabase.rpc(
      'ai_reply_reliability_snapshot',
      { p_account_id: accountId }
    );
    if (error) {
      console.error('[ai/reliability] snapshot failed:', error);
      return NextResponse.json(
        { error: 'Não foi possível carregar a saúde da IA' },
        { status: 500 }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
