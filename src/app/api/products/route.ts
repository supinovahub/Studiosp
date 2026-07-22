import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { mediaPayload, productPayload } from '@/lib/products/validate';

const SELECT = '*, product_media(*)';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim();
    const status = url.searchParams.get('status')?.trim();
    let query = supabase
      .from('products')
      .select(SELECT)
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(200);
    if (status) query = query.eq('availability_status', status);
    if (search) {
      const safe = search.replace(/[,%()]/g, ' ').trim();
      if (safe)
        query = query.or(
          `name.ilike.%${safe}%,development_name.ilike.%${safe}%,neighborhood.ilike.%${safe}%,city.ilike.%${safe}%,sku.ilike.%${safe}%`
        );
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ products: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    const parsed = productPayload(body);
    if (parsed.error)
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    const media = Array.isArray(body?.media) ? body.media : [];
    const parsedMedia: ReturnType<typeof mediaPayload>[] = media.map(mediaPayload);
    const mediaError = parsedMedia.find(
      (item: ReturnType<typeof mediaPayload>) => item.error
    )?.error;
    if (mediaError)
      return NextResponse.json({ error: mediaError }, { status: 400 });

    const { data: product, error } = await supabase
      .from('products')
      .insert({ ...parsed.data, account_id: accountId, created_by: userId })
      .select()
      .single();
    if (error) throw error;
    if (parsedMedia.length > 0) {
      const { error: mediaInsertError } = await supabase
        .from('product_media')
        .insert(
          parsedMedia.map((item: ReturnType<typeof mediaPayload>) => ({
            ...item.data,
            account_id: accountId,
            product_id: product.id,
          }))
        );
      if (mediaInsertError) throw mediaInsertError;
    }
    const { data: complete, error: reloadError } = await supabase
      .from('products')
      .select(SELECT)
      .eq('id', product.id)
      .single();
    if (reloadError) throw reloadError;
    return NextResponse.json({ product: complete }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
