import type { AccountRole } from '@/lib/auth/roles';

const BROKER_VIEWS = new Set([
  'my-day',
  'leads',
  'lead',
  'agenda',
  'team',
  'developments',
]);

export function canAccessStudiospView(role: AccountRole, view: string) {
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'agent') return BROKER_VIEWS.has(view);
  return false;
}

