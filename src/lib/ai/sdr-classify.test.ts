import { describe, expect, it } from 'vitest';
import { parseSdrClassification } from './sdr-classify';

describe('parseSdrClassification', () => {
  it('normalizes a valid fenced classification', () => {
    const result = parseSdrClassification(`\`\`\`json
      {"primary_intent":"photos","intents":["photos","price"],"lead_stage":"qualified","temperature":"hot","score":88,"budget_max":650000,"preferred_neighborhoods":["Pinheiros"],"wants_photos":true,"confidence":0.91}
    \`\`\``);
    expect(result.primaryIntent).toBe('photos');
    expect(result.wantsPhotos).toBe(true);
    expect(result.score).toBe(88);
    expect(result.budgetMax).toBe(650000);
    expect(result.preferredNeighborhoods).toEqual(['Pinheiros']);
  });

  it('fails closed for malformed output', () => {
    const result = parseSdrClassification('not json');
    expect(result.primaryIntent).toBe('other');
    expect(result.score).toBe(0);
    expect(result.requiresHandoff).toBe(false);
  });

  it('forces handoff for complaints', () => {
    const result = parseSdrClassification(
      '{"primary_intent":"complaint","requires_handoff":false}'
    );
    expect(result.requiresHandoff).toBe(true);
  });
});
