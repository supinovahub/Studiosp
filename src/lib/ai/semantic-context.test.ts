import { describe, expect, it } from 'vitest';
import {
  readSemanticContext,
  semanticMessageMetadata,
} from './semantic-context';

describe('semantic message context', () => {
  it('preserves a reactivation interest expectation between turns', () => {
    const metadata = semanticMessageMetadata({
      version: 1,
      mode: 'reactivation',
      expectedQuestionKey: null,
      expectedResponseKind: 'reactivation_interest',
    });

    expect(readSemanticContext(metadata)).toEqual(
      expect.objectContaining({
        mode: 'reactivation',
        expectedResponseKind: 'reactivation_interest',
      })
    );
  });
});
