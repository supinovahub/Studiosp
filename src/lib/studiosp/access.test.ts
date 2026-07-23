import { describe, expect, it } from 'vitest';
import { canAccessStudiospView } from './access';

const ADMIN_VIEWS = [
  'overview',
  'attention',
  'pipeline',
  'followups',
  'developments',
  'intelligence',
  'settings',
  'reports',
];

describe('StudioSP view authorization', () => {
  it.each(ADMIN_VIEWS)('allows management to access %s', (view) => {
    expect(canAccessStudiospView('owner', view)).toBe(true);
    expect(canAccessStudiospView('admin', view)).toBe(true);
  });

  it.each(ADMIN_VIEWS)('rejects a broker from %s', (view) => {
    expect(canAccessStudiospView('agent', view)).toBe(false);
  });

  it.each(['my-day', 'leads', 'lead', 'agenda', 'team'])(
    'allows a broker to access %s',
    (view) => expect(canAccessStudiospView('agent', view)).toBe(true)
  );

  it('rejects viewers and unknown views', () => {
    expect(canAccessStudiospView('viewer', 'leads')).toBe(false);
    expect(canAccessStudiospView('agent', 'unknown')).toBe(false);
  });
});
