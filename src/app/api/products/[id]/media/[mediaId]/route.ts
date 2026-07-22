import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

interface Params {
  params: Promise<{ id: string; mediaId: string }>;
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, mediaId } = await params;
    const { supabase, accountId } = await requireRole('admin');
    const { data: media, error: lookupError } = await supabase
      .from('product_media')
      .select('id, url')
      .eq('id', mediaId)
      .eq('product_id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!media)
      return NextResponse.json({ error: 'Mídia não encontrada.' }, { status: 404 });

    const { error } = await supabase
      .from('product_media')
      .delete()
      .eq('id', mediaId)
      .eq('product_id', id)
      .eq('account_id', accountId);
    if (error) throw error;

    const marker = '/storage/v1/object/public/product-media/';
    const markerIndex = media.url.indexOf(marker);
    if (markerIndex >= 0) {
      const path = decodeURIComponent(media.url.slice(markerIndex + marker.length));
      const { error: storageError } = await supabase.storage
        .from('product-media')
        .remove([path]);
      if (storageError)
        console.error('[product media] orphaned object:', storageError);
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
