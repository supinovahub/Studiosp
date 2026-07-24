'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, LogOut, Menu, Settings, User } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/layout/mode-toggle';

const pageTitles: Record<string, string> = {
  '/visao-geral': 'Visão geral',
  '/meu-dia': 'Meu dia',
  '/atencao': 'Central de atenção',
  '/inbox': 'Inbox',
  '/leads': 'Leads',
  '/pipeline': 'Pipeline',
  '/agenda': 'Agenda',
  '/follow-ups': 'Follow-ups',
  '/reativacao': 'Reativação de base',
  '/imoveis': 'Empreendimentos',
  '/equipe': 'Equipe e disponibilidade',
  '/inteligencia': 'Inteligência',
  '/relatorios': 'Relatórios',
  '/configuracoes': 'Configurações',
};

function titleFor(pathname: string) {
  const match = Object.entries(pageTitles).find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`)
  );
  return match?.[1] ?? 'Studiosp';
}

export function Header({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const unread = useUnreadNotifications();
  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'U';

  return (
    <header className="border-border bg-background flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Abrir menu"
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-10 items-center justify-center rounded-lg lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-foreground truncate text-sm font-semibold sm:text-base">
            {titleFor(pathname)}
          </h1>
          <p className="text-muted-foreground hidden text-[10px] sm:block">
            Operação em tempo real
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Link
          href="/atencao"
          aria-label="Abrir central de atenção"
          className="text-muted-foreground hover:bg-muted hover:text-foreground relative flex size-9 items-center justify-center rounded-lg"
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="border-background absolute top-1.5 right-1.5 size-2 rounded-full border-2 bg-amber-400" />
          ) : null}
        </Link>
        <ModeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Abrir menu da conta"
            className="hover:bg-muted ml-1 flex items-center gap-2 rounded-lg p-1 focus:outline-none"
          >
            <Avatar className="size-8">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? 'Usuário'}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="text-foreground hidden max-w-32 truncate pr-2 text-xs font-medium sm:block">
              {profile?.full_name ?? 'Usuário'}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="min-w-56">
            <div className="px-2 py-1.5">
              <p className="text-foreground truncate text-sm font-medium">
                {profile?.full_name ?? 'Usuário'}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {profile?.email ?? ''}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings?tab=profile" />}>
              <User className="size-4" /> Meu perfil
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/configuracoes" />}>
              <Settings className="size-4" /> Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="size-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
