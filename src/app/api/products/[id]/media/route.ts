import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { mediaPayload } from '@/lib/products/validate';

interface Params { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { supabase, accountId } = await requireRole('admin');
    const parsed = mediaPayload(await request.json().catch(() => null));
    if (parsed.error)
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (!product)
      return NextResponse.json({ error: 'Imóvel não encontrado.' }, { status: 404 });
    if (parsed.data?.is_cover === true) {
      await supabase
        .from('product_media')
        .update({ is_cover: false })
        .eq('product_id', id)
        .eq('account_id', accountId);
    }
    const { data, error } = await supabase
      .from('product_media')
      .insert({ ...parsed.data, product_id: id, account_id: accountId })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ media: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
