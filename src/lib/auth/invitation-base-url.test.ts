import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getInvitationBaseUrl } from './invitation-base-url';

describe.sequential('getInvitationBaseUrl', () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalAllowedHosts = process.env.ALLOWED_INVITE_HOSTS;
  const originalVercelEnvironment = process.env.VERCEL_ENV;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.ALLOWED_INVITE_HOSTS;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
    if (originalAllowedHosts === undefined) {
      delete process.env.ALLOWED_INVITE_HOSTS;
    } else {
      process.env.ALLOWED_INVITE_HOSTS = originalAllowedHosts;
    }
    if (originalVercelEnvironment === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnvironment;
    }
  });

  it('prioriza a URL pública explícita e remove barras finais', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://app.studiosp.com.br///';
    const request = new Request('https://preview.vercel.app/api/test');

    expect(getInvitationBaseUrl(request)).toBe('https://app.studiosp.com.br');
  });

  it('usa o primeiro host encaminhado pelo proxy', () => {
    const request = new Request('http://interno/api/test', {
      headers: {
        'x-forwarded-host':
          'studiosp-feature.vercel.app, proxy-interno.vercel.app',
        'x-forwarded-proto': 'https',
      },
    });

    expect(getInvitationBaseUrl(request)).toBe(
      'https://studiosp-feature.vercel.app'
    );
  });

  it('mantém convites de preview no próprio preview da Vercel', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://studiosp.vercel.app';
    const request = new Request('https://interno/api/test', {
      headers: {
        'x-forwarded-host': 'studiosp-feature-abc.vercel.app',
        'x-forwarded-proto': 'https',
      },
    });

    expect(getInvitationBaseUrl(request)).toBe(
      'https://studiosp-feature-abc.vercel.app'
    );
  });

  it('aceita porta local quando o hostname está permitido', () => {
    process.env.ALLOWED_INVITE_HOSTS = 'localhost, studiosp.vercel.app';
    const request = new Request('http://localhost:3000/api/test', {
      headers: { host: 'localhost:3000' },
    });

    expect(getInvitationBaseUrl(request)).toBe('http://localhost:3000');
  });

  it('rejeita um Host fora da lista e usa o domínio seguro', () => {
    process.env.ALLOWED_INVITE_HOSTS = 'studiosp.vercel.app';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const request = new Request('https://phishing.example/api/test', {
      headers: { host: 'phishing.example' },
    });

    expect(getInvitationBaseUrl(request)).toBe('https://studiosp.vercel.app');
  });
});
