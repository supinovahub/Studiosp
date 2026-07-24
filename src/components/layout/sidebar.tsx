'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  CircleGauge,
  Clock3,
  Crown,
  Inbox,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
  RefreshCcw,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

interface NavigationItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: 'inbox';
}

const ownerSections: { label: string; items: NavigationItem[] }[] = [
  {
    label: 'Comando',
    items: [
      { href: '/visao-geral', label: 'Visão geral', icon: CircleGauge },
      { href: '/atencao', label: 'Central de atenção', icon: Sparkles },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/inbox', label: 'Inbox', icon: Inbox, badge: 'inbox' },
      { href: '/leads', label: 'Leads', icon: Users },
      { href: '/pipeline', label: 'Pipeline', icon: LayoutDashboard },
      { href: '/agenda', label: 'Agenda', icon: CalendarDays },
      { href: '/follow-ups', label: 'Follow-ups', icon: Clock3 },
      { href: '/reativacao', label: 'Reativação de base', icon: RefreshCcw },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/imoveis', label: 'Empreendimentos', icon: Building2 },
      { href: '/equipe', label: 'Equipe', icon: UserRoundCheck },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/inteligencia', label: 'Inteligência', icon: Bot },
      { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
      { href: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
];

const brokerSections: typeof ownerSections = [
  {
    label: 'Meu trabalho',
    items: [
      { href: '/meu-dia', label: 'Meu dia', icon: CircleGauge },
      { href: '/atencao', label: 'Minhas pendências', icon: Sparkles },
      { href: '/inbox', label: 'Inbox', icon: Inbox, badge: 'inbox' },
      { href: '/leads', label: 'Meus leads', icon: Users },
      { href: '/agenda', label: 'Agenda', icon: CalendarDays },
      { href: '/imoveis', label: 'Empreendimentos', icon: Building2 },
      { href: '/equipe', label: 'Disponibilidade', icon: UserRoundCheck },
    ],
  },
];

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const isManager = accountRole === 'owner' || accountRole === 'admin';
  const sections = isManager ? ownerSections : brokerSections;

  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onClose}
        className={cn(
          'bg-background/75 fixed inset-0 z-30 backdrop-blur-sm transition-opacity lg:hidden',
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      />
      <aside
        aria-label="Navegação principal"
        className={cn(
          'border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r transition-transform duration-200 lg:static lg:z-0 lg:w-60 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="border-sidebar-border flex h-14 shrink-0 items-center justify-between border-b px-4">
          <Link
            href={isManager ? '/visao-geral' : '/meu-dia'}
            className="flex items-center gap-2.5"
          >
            <div className="border-primary/30 bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg border">
              <Building2 className="size-4" />
            </div>
            <div>
              <p className="text-sidebar-foreground text-sm leading-none font-semibold">
                Studiosp
              </p>
              <p className="text-muted-foreground mt-1 text-[10px] tracking-wider uppercase">
                Central de vendas
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground flex size-10 items-center justify-center rounded-lg lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {!profileLoading && account?.name ? (
            <div className="border-sidebar-border bg-sidebar-accent/40 mb-4 rounded-lg border px-3 py-2">
              <p className="text-sidebar-foreground truncate text-xs font-medium">
                {account.name}
              </p>
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[10px]">
                {isManager ? (
                  <Crown className="size-3 text-amber-300" />
                ) : (
                  <UserRoundCheck className="size-3" />
                )}
                {isManager ? 'Gestão da operação' : 'Corretor'}
              </p>
            </div>
          ) : null}

          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.label}>
                <p className="text-muted-foreground mb-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] uppercase">
                  {section.label}
                </p>
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const active =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors lg:min-h-9',
                            active
                              ? 'bg-primary/12 text-primary'
                              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                          )}
                        >
                          <item.icon className="size-4" />
                          <span className="flex-1">{item.label}</span>
                          {item.badge === 'inbox' && totalUnread > 0 ? (
                            <span className="bg-primary text-primary-foreground flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                              {totalUnread > 99 ? '99+' : totalUnread}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </nav>

        <div className="border-sidebar-border shrink-0 border-t p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar className="size-8 shrink-0">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? 'Usuário'}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {profile?.full_name?.charAt(0)?.toUpperCase() ??
                  profile?.email?.charAt(0)?.toUpperCase() ??
                  'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sidebar-foreground truncate text-xs font-medium">
                {profile?.full_name ?? 'Usuário'}
              </p>
              <p className="text-muted-foreground truncate text-[10px]">
                {profile?.email ?? ''}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sair da conta"
              title="Sair da conta"
              className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground flex size-9 items-center justify-center rounded-lg"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
