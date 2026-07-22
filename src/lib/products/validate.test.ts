import { describe, expect, it } from 'vitest';
import { mediaPayload, productPayload } from './validate';

describe('product validation', () => {
  it('accepts a valid studio', () => {
    const result = productPayload({
      name: 'Studio Centro',
      property_type: 'studio',
      features: ['metrô', ' academia '],
    });
    expect(result.error).toBeUndefined();
    expect(result.data?.features).toEqual(['metrô', 'academia']);
  });

  it('rejects missing name and non-https media', () => {
    expect(productPayload({}).error).toBeTruthy();
    expect(mediaPayload({ url: 'http://example.com/a.jpg' }).error).toBeTruthy();
  });
});
