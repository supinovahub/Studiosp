import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';

export const runtime = 'nodejs';

const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const ALLOWED_MEDIA_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'mp4',
  'mov',
  'pdf',
  'ppt',
  'pptx',
]);

function isAllowedMedia(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return (
    ALLOWED_MEDIA_TYPES.has(file.type.toLowerCase()) ||
    ALLOWED_MEDIA_EXTENSIONS.has(extension)
  );
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const mediaId = request.nextUrl.searchParams.get('id');
    if (!mediaId)
      return NextResponse.json(
        { error: 'Mídia não informada.' },
        { status: 400 }
      );
    const { data: version, error } = await ctx.supabase
      .from('development_media_versions')
      .select('object_path')
      .eq('account_id', ctx.accountId)
      .eq('media_id', mediaId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !version)
      return NextResponse.json(
        { error: 'Arquivo não encontrado.' },
        { status: 404 }
      );
    const signed = await ctx.supabase.storage
      .from('development-media')
      .createSignedUrl(version.object_path, 300);
    if (signed.error || !signed.data?.signedUrl) {
      return NextResponse.json(
        { error: 'Não foi possível abrir o arquivo.' },
        { status: 400 }
      );
    }
    return NextResponse.redirect(signed.data.signedUrl);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function mediaTypeFor(mime: string) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.includes('presentation') || mime.includes('powerpoint'))
    return 'presentation';
  return 'document';
}

function safeFilename(name: string) {
  const extension = name.includes('.') ? `.${name.split('.').pop()}` : '';
  const stem = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${stem || 'arquivo'}${extension.toLowerCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    if (!hasMinRole(ctx.role, 'admin')) {
      return NextResponse.json(
        { error: 'Somente o dono pode enviar arquivos.' },
        { status: 403 }
      );
    }

    const form = await request.formData();
    const file = form.get('file');
    const developmentId = String(form.get('developmentId') ?? '');
    const title = String(form.get('title') ?? '').trim();
    const category = String(form.get('category') ?? 'custom').trim();
    const visibility = String(form.get('visibility') ?? 'broker').trim();
    if (!(file instanceof File) || !developmentId) {
      return NextResponse.json(
        { error: 'Selecione um empreendimento e um arquivo.' },
        { status: 400 }
      );
    }
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'O arquivo deve ter no máximo 100 MB.' },
        { status: 400 }
      );
    }
    if (!isAllowedMedia(file)) {
      return NextResponse.json(
        {
          error:
            'Formato não permitido. Envie imagens JPG, PNG, WebP ou GIF; vídeos MP4 ou MOV; documentos PDF, PPT ou PPTX.',
        },
        { status: 400 }
      );
    }

    const { data: development, error: developmentError } = await ctx.supabase
      .from('developments')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('id', developmentId)
      .maybeSingle();
    if (developmentError || !development) {
      return NextResponse.json(
        { error: 'Empreendimento não encontrado.' },
        { status: 404 }
      );
    }

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('user_id', ctx.userId)
      .maybeSingle();

    const objectPath = `${ctx.accountId}/${developmentId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
    const bytes = await file.arrayBuffer();
    const checksum = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    )
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');

    const uploadResult = await ctx.supabase.storage
      .from('development-media')
      .upload(objectPath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (uploadResult.error) {
      console.error('[Studiosp/media] upload:', uploadResult.error);
      return NextResponse.json(
        { error: 'Não foi possível enviar o arquivo.' },
        { status: 400 }
      );
    }

    const mediaResult = await ctx.supabase
      .from('development_media')
      .insert({
        account_id: ctx.accountId,
        development_id: developmentId,
        media_type: mediaTypeFor(file.type),
        category: category || 'custom',
        title: title || file.name,
        visibility: ['owner_only', 'broker', 'shareable'].includes(visibility)
          ? visibility
          : 'broker',
        status: 'published',
        created_by: profile?.id ?? null,
      })
      .select()
      .single();

    if (mediaResult.error || !mediaResult.data) {
      await ctx.supabase.storage.from('development-media').remove([objectPath]);
      console.error('[Studiosp/media] metadata:', mediaResult.error);
      return NextResponse.json(
        { error: 'O arquivo foi recebido, mas o cadastro da mídia falhou.' },
        { status: 400 }
      );
    }

    const versionResult = await ctx.supabase
      .from('development_media_versions')
      .insert({
        account_id: ctx.accountId,
        media_id: mediaResult.data.id,
        version: 1,
        object_path: objectPath,
        original_filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        checksum_sha256: checksum,
        created_by: profile?.id ?? null,
      })
      .select()
      .single();

    if (versionResult.error) {
      console.error('[Studiosp/media] version:', versionResult.error);
      await ctx.supabase
        .from('development_media')
        .update({ status: 'failed' })
        .eq('account_id', ctx.accountId)
        .eq('id', mediaResult.data.id);
      return NextResponse.json(
        { error: 'O arquivo foi enviado, mas precisa de revisão no cadastro.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      media: mediaResult.data,
      version: versionResult.data,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
