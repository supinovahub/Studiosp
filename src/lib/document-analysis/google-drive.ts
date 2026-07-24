import { fileTypeFromBuffer } from 'file-type';

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const DOWNLOAD_HOSTS = new Set([
  ...ALLOWED_HOSTS,
  'drive.usercontent.google.com',
]);

export type DriveTarget = { downloadUrl: string; filename: string };

export function parseGoogleDriveLink(rawUrl: string): DriveTarget | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null;
  const id =
    url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9_-]{10,}$/.test(id)) return null;

  if (url.hostname === 'docs.google.com') {
    if (url.pathname.startsWith('/document/')) {
      return {
        downloadUrl: `https://docs.google.com/document/d/${id}/export?format=docx`,
        filename: `documento-${id.slice(0, 8)}.docx`,
      };
    }
    if (url.pathname.startsWith('/spreadsheets/')) {
      return {
        downloadUrl: `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,
        filename: `planilha-${id.slice(0, 8)}.xlsx`,
      };
    }
    return null;
  }
  return {
    downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
    filename: `arquivo-drive-${id.slice(0, 8)}`,
  };
}

function filenameFromDisposition(value: string | null) {
  if (!value) return null;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

function safeFilename(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export async function downloadGoogleDriveFile(rawUrl: string) {
  const target = parseGoogleDriveLink(rawUrl);
  if (!target) throw new Error('Link compartilhado do Google Drive inválido.');
  let currentUrl = target.downloadUrl;
  let response: Response | null = null;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const current = new URL(currentUrl);
    if (current.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(current.hostname)) {
      throw new Error('O Google Drive redirecionou para um endereço não permitido.');
    }
    response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirecionamento inválido do Google Drive.');
    currentUrl = new URL(location, current).toString();
    response = null;
  }
  if (!response) throw new Error('O Google Drive excedeu o limite de redirecionamentos.');
  if (!response.ok) {
    throw new Error(
      response.status === 403 || response.status === 404
        ? 'O link do Google Drive não está público para leitura.'
        : 'Não foi possível baixar o arquivo do Google Drive.'
    );
  }
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_BYTES) {
    throw new Error('O arquivo do Google Drive excede o limite de 50 MB.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) {
    throw new Error(
      !bytes.length
        ? 'O arquivo compartilhado está vazio.'
        : 'O arquivo do Google Drive excede o limite de 50 MB.'
    );
  }
  const detected = await fileTypeFromBuffer(bytes);
  const mimeType =
    detected?.mime ??
    response.headers.get('content-type')?.split(';')[0] ??
    'application/octet-stream';
  let filename =
    safeFilename(
      filenameFromDisposition(response.headers.get('content-disposition')) ??
        target.filename
    ) || 'documento';
  if (detected?.ext && !filename.toLowerCase().endsWith(`.${detected.ext}`)) {
    filename += `.${detected.ext}`;
  }
  return { bytes, filename, mimeType };
}
