import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

interface Params { params: Promise<{ id: string; mediaId: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, mediaId } = await params;
    const { supabase, accountId } = await requireRole('admin');
    const { data, error } = await supabase
      .from('product_media')
      .delete()
      .eq('id', mediaId)
      .eq('product_id', id)
      .eq('account_id', accountId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json({ error: 'Mídia não encontrada.' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
