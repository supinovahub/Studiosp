'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { PresenceHeartbeat } from '@/components/presence/presence-heartbeat';
import { BrokerWhatsappOnboarding } from '@/components/studiosp/broker-whatsapp-onboarding';
import { ReactivationQueueHeartbeat } from '@/components/studiosp/reactivation-queue-heartbeat';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

interface BrokerActivationState {
  status: 'checking' | 'ready' | 'required' | 'error';
  phone?: string;
  error?: string;
}

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading, accountRole, signOut } =
    useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isManager = accountRole === 'owner' || accountRole === 'admin';
  const managerOnlyRoute = [
    '/visao-geral',
    '/pipeline',
    '/follow-ups',
    '/reativacao',
    '/relatorios',
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const [brokerActivation, setBrokerActivation] =
    useState<BrokerActivationState>({ status: 'checking' });
  const profileId = profile?.id;

  const loadBrokerActivation =
    useCallback(async (): Promise<BrokerActivationState> => {
      if (accountRole !== 'agent' || !profileId) {
        return { status: 'ready' };
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from('broker_profiles')
        .select('whatsapp_e164, whatsapp_verified_at')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (error) {
        console.error('[DashboardShell] broker activation check failed:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return {
          status: 'error',
          error:
            'Não foi possível verificar seu WhatsApp operacional. Tente novamente.',
        };
      }

      if (data?.whatsapp_e164 && data.whatsapp_verified_at) {
        return { status: 'ready', phone: data.whatsapp_e164 };
      }

      return {
        status: 'required',
        phone: data?.whatsapp_e164 ?? '',
      };
    }, [accountRole, profileId]);

  const refreshBrokerActivation = useCallback(() => {
    setBrokerActivation({ status: 'checking' });
    void loadBrokerActivation().then(setBrokerActivation);
  }, [loadBrokerActivation]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && !profileLoading && user && !isManager && managerOnlyRoute) {
      router.replace('/meu-dia');
    }
  }, [isManager, loading, managerOnlyRoute, profileLoading, router, user]);

  useEffect(() => {
    if (!loading && !profileLoading && user) {
      let cancelled = false;
      void loadBrokerActivation().then((nextState) => {
        if (!cancelled) setBrokerActivation(nextState);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [loadBrokerActivation, loading, profileLoading, user]);

  if (
    loading ||
    profileLoading ||
    (!!user && !isManager && managerOnlyRoute) ||
    (accountRole === 'agent' && brokerActivation.status === 'checking')
  ) {
    return (
      <div className="bg-background flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (accountRole === 'agent' && brokerActivation.status === 'error') {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-4">
        <div className="border-border bg-card w-full max-w-md rounded-lg border p-5 text-center">
          <h1 className="text-foreground text-base font-semibold">
            Não foi possível concluir sua entrada
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {brokerActivation.error}
          </p>
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={refreshBrokerActivation}>Tentar novamente</Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Sair da conta
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (accountRole === 'agent' && brokerActivation.status === 'required') {
    return (
      <BrokerWhatsappOnboarding
        initialPhone={brokerActivation.phone}
        onCompleted={refreshBrokerActivation}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="bg-background flex h-screen overflow-hidden">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <ReactivationQueueHeartbeat enabled={isManager} />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
