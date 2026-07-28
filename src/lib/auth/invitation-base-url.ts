/**
 * Resolve the public origin used in invitation links.
 *
 * An explicit site URL wins. Otherwise we accept the proxy/browser host only
 * when it is present in ALLOWED_INVITE_HOSTS (when configured). This keeps
 * preview deployments working while allowing production to reject forged
 * Host headers.
 */
export function getInvitationBaseUrl(request: Request): string {
  const forwardedHost = firstHeaderValue(
    request.headers.get('x-forwarded-host')
  );
  const forwardedProto = firstHeaderValue(
    request.headers.get('x-forwarded-proto')
  );

  // A Preview must generate a link for its own deployment, never for the
  // production origin possibly stored in NEXT_PUBLIC_SITE_URL. Vercel
  // overwrites these headers at the edge, so this branch does not trust a
  // browser-supplied Host directly.
  if (process.env.VERCEL_ENV === 'preview' && forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`;
  }

  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const allowedHosts = parseAllowedHosts();
  if (forwardedHost && isHostAllowed(forwardedHost, allowedHosts)) {
    return `${forwardedProto || 'https'}://${forwardedHost}`;
  }

  const host = request.headers.get('host')?.trim();
  if (host && isHostAllowed(host, allowedHosts)) {
    return `${new URL(request.url).protocol}//${host}`;
  }

  if (allowedHosts && (forwardedHost || host)) {
    console.warn('[invitation URL] host fora da lista permitida', {
      forwardedHost,
      host,
      allowedHosts,
    });
  } else {
    console.warn(
      '[invitation URL] origem pública indisponível; usando domínio padrão'
    );
  }

  return 'https://studiosp.vercel.app';
}

function parseAllowedHosts(): readonly string[] | null {
  const raw = process.env.ALLOWED_INVITE_HOSTS?.trim();
  if (!raw) return null;

  const hosts = raw
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return hosts.length > 0 ? hosts : null;
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

function isHostAllowed(
  hostWithOptionalPort: string,
  allowedHosts: readonly string[] | null
): boolean {
  if (!allowedHosts) return true;

  const hostname = hostWithOptionalPort
    .replace(/^\[/, '')
    .replace(/\](:\d+)?$/, '')
    .replace(/:\d+$/, '')
    .toLowerCase();

  return allowedHosts.includes(hostname);
}
