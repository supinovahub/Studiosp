import { describe, expect, it } from 'vitest';
import { isContactAutomationSuppressed } from './automation';

describe('isContactAutomationSuppressed', () => {
  it('bloqueia somente contatos explicitamente suprimidos', () => {
    expect(
      isContactAutomationSuppressed({ automation_status: 'suppressed' })
    ).toBe(true);
    expect(
      isContactAutomationSuppressed({ automation_status: 'enabled' })
    ).toBe(false);
    expect(isContactAutomationSuppressed({})).toBe(false);
  });
});
