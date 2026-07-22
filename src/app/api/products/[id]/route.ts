import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { productPayload } from '@/lib/products/validate';
import { syncProductKnowledge } from '@/lib/products/knowledge';

interface Params { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { supabase, accountId } = await requireRole('viewer');
    const { data, error } = await supabase
      .from('products')
      .select('*, product_media(*)')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json({ error: 'Imóvel não encontrado.' }, { status: 404 });
    return NextResponse.json({ product: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { supabase, accountId, userId } = await requireRole('admin');
    const parsed = productPayload(await request.json().catch(() => null), {
      partial: true,
    });
    if (parsed.error)
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!parsed.data || Object.keys(parsed.data).length === 0)
      return NextResponse.json({ error: 'Nenhum campo válido enviado.' }, { status: 400 });
    const { data, error } = await supabase
      .from('products')
      .update(parsed.data)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*, product_media(*)')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json({ error: 'Imóvel não encontrado.' }, { status: 404 });
    const indexing = await syncProductKnowledge(supabase, accountId, id, userId);
    return NextResponse.json({ product: data, indexingWarning: indexing.warning });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { supabase, accountId } = await requireRole('admin');
    const { data: media } = await supabase
      .from('product_media')
      .select('url')
      .eq('product_id', id)
      .eq('account_id', accountId);
    const marker = '/storage/v1/object/public/product-media/';
    const paths = (media ?? [])
      .map((item) => {
        const index = item.url.indexOf(marker);
        return index >= 0
          ? decodeURIComponent(item.url.slice(index + marker.length))
          : null;
      })
      .filter((path): path is string => Boolean(path));
    const { data, error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json({ error: 'Imóvel não encontrado.' }, { status: 404 });
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from('product-media')
        .remove(paths);
      if (storageError)
        console.error('[products DELETE] orphaned objects:', storageError);
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
