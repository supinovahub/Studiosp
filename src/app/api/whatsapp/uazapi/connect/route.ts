import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { configureUazapiWebhook, connectUazapi } from '@/lib/whatsapp/uazapi';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile?.account_id || !['owner', 'admin'].includes(profile.role)) {
      return NextResponse.json(
        {
          error:
            'Somente proprietários e administradores podem conectar o WhatsApp.',
        },
        { status: 403 }
      );
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', profile.account_id)
      .eq('provider', 'uazapi')
      .maybeSingle();
    if (configError || !config?.uazapi_base_url) {
      return NextResponse.json(
        { error: 'Salve a configuração da UAZAPI antes de iniciar a conexão.' },
        { status: 400 }
      );
    }

    let phone: string | undefined;
    try {
      const body = (await request.json()) as { phone?: unknown };
      if (typeof body.phone === 'string' && body.phone.trim()) {
        phone = body.phone.replace(/\D/g, '');
        if (!/^\d{10,15}$/.test(phone)) {
          return NextResponse.json(
            { error: 'Informe o número com DDI e DDD.' },
            { status: 400 }
          );
        }
      }
    } catch {
      // Corpo vazio significa conexão por QR Code.
    }

    const token = decrypt(config.access_token);
    const status = await connectUazapi(
      { baseUrl: config.uazapi_base_url, token },
      phone
    );
    await supabase
      .from('whatsapp_config')
      .update({
        phone_number_id: status.phone ?? config.phone_number_id,
        uazapi_instance_id: status.instance.id ?? config.uazapi_instance_id,
        uazapi_instance_name:
          status.instance.name ??
          status.instance.profileName ??
          config.uazapi_instance_name,
        status:
          status.instance.status ??
          (status.connected ? 'connected' : 'connecting'),
        connected_at: status.connected ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', profile.account_id);

    const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
    let webhookConfigured = false;
    if (publicOrigin?.startsWith('https://')) {
      try {
        const webhookSecret = config.verify_token
          ? decrypt(config.verify_token)
          : null;
        if (!webhookSecret) throw new Error('Segredo do webhook ausente.');
        await configureUazapiWebhook(
          { baseUrl: config.uazapi_base_url, token },
          `${publicOrigin}/api/whatsapp/uazapi/webhook?secret=${encodeURIComponent(webhookSecret)}`
        );
        webhookConfigured = true;
      } catch (error) {
        console.warn(
          '[uazapi/connect] webhook setup failed:',
          error instanceof Error ? error.message : error
        );
      }
    }

    return NextResponse.json({
      connected: status.connected,
      logged_in: status.loggedIn,
      status: status.instance.status,
      phone: status.phone,
      qrcode: status.instance.qrcode,
      paircode: status.instance.paircode,
      instance: {
        id: status.instance.id,
        name: status.instance.name,
        profile_name: status.instance.profileName,
      },
      webhook_configured: webhookConfigured,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro desconhecido da UAZAPI';
    console.error('[uazapi/connect] failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
