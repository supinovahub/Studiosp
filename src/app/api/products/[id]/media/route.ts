import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { mediaPayload } from '@/lib/products/validate';

interface Params { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { supabase, accountId } = await requireRole('admin');
    const contentType = request.headers.get('content-type') ?? '';
    let mediaInput: Record<string, unknown> | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File))
        return NextResponse.json({ error: 'Selecione uma imagem.' }, { status: 400 });
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))
        return NextResponse.json({ error: 'Formato de imagem não permitido.' }, { status: 400 });
      if (file.size > 10 * 1024 * 1024)
        return NextResponse.json({ error: 'A imagem deve ter no máximo 10 MB.' }, { status: 400 });

      const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `account-${accountId}/${id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('product-media')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from('product-media').getPublicUrl(path);
      mediaInput = {
        url: publicUrl.publicUrl,
        media_type: 'image',
        alt_text: form.get('alt_text'),
        caption: form.get('caption'),
        is_cover: form.get('is_cover') === 'true',
      };
    } else {
      mediaInput = await request.json().catch(() => null);
    }

    const parsed = mediaPayload(mediaInput);
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
