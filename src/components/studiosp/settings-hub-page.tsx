'use client';

import Link from 'next/link';
import {
  Bot,
  ChevronRight,
  Clock3,
  KeyRound,
  MessageSquare,
  Settings,
  Shield,
  UserRound,
  Users,
} from 'lucide-react';
import { useStudiospData } from '@/hooks/use-studiosp-data';
import { PageHeader } from './page-header';
import { ErrorState, LoadingState } from './operational-state';
import { StatusBadge } from './status-badge';

const settings = [
  {
    href: '/inteligencia',
    title: 'IA e qualificação',
    description: 'Prompt, perguntas, normalização e execuções',
    icon: Bot,
    managerOnly: true,
  },
  {
    href: '/inteligencia',
    title: 'Follow-ups e agenda',
    description: 'Cadência, prazos e política de horário garantido',
    icon: Clock3,
    managerOnly: true,
  },
  {
    href: '/settings?tab=whatsapp',
    title: 'WhatsApp e UAZAPI',
    description: 'Conexão, QR Code, webhook e provedor ativo',
    icon: MessageSquare,
    managerOnly: true,
  },
  {
    href: '/settings?tab=members',
    title: 'Usuários e acessos',
    description: 'Dono, administradores, corretores e visualização',
    icon: Users,
    managerOnly: true,
  },
  {
    href: '/settings?tab=profile',
    title: 'Meu perfil',
    description: 'Nome, foto e dados pessoais',
    icon: UserRound,
    managerOnly: false,
  },
  {
    href: '/settings?tab=security',
    title: 'Segurança',
    description: 'Senha, sessões e proteção da conta',
    icon: Shield,
    managerOnly: false,
  },
  {
    href: '/agents',
    title: 'Credencial do modelo de IA',
    description: 'Chave criptografada e provedor de linguagem',
    icon: KeyRound,
    managerOnly: true,
  },
];

export function SettingsHubPage() {
  const { data, loading, error, reload } = useStudiospData('settings');
  if (loading) return <LoadingState label="Carregando configurações..." />;
  if (error || !data)
    return <ErrorState error={error ?? 'Resposta vazia.'} onRetry={reload} />;
  const manager = data.role === 'owner' || data.role === 'admin';
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administração"
        title="Configurações"
        description="Atalhos para tudo que controla a operação. As regras de negócio ficam separadas das credenciais e preferências pessoais."
      />
      <div className="border-border bg-card flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <div className="border-primary/20 bg-primary/10 flex size-10 items-center justify-center rounded-lg border">
            <Settings className="text-primary size-5" />
          </div>
          <div>
            <p className="text-foreground text-sm font-medium">
              Ambiente atual
            </p>
            <p className="text-muted-foreground text-xs">
              Envios externos protegidos pela trava do ambiente de homologação
            </p>
          </div>
        </div>
        <StatusBadge
          label={
            process.env.NEXT_PUBLIC_APP_ENV === 'staging'
              ? 'Homologação'
              : 'Ambiente ativo'
          }
          tone="warning"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {settings
          .filter((item) => manager || !item.managerOnly)
          .map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group border-border bg-card hover:border-primary/30 hover:bg-muted/25 flex items-center gap-3 rounded-lg border p-4"
            >
              <div className="border-border bg-muted/50 text-muted-foreground group-hover:text-primary flex size-10 shrink-0 items-center justify-center rounded-lg border">
                <item.icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-foreground text-sm font-semibold">
                  {item.title}
                </h3>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {item.description}
                </p>
              </div>
              <ChevronRight className="text-muted-foreground size-4" />
            </Link>
          ))}
      </div>
    </div>
  );
}
