import { describe, expect, it } from 'vitest';
import { inferFlagType } from './flag.models';

describe('inferFlagType', () => {
  it('returns string for string variants', () => {
    const result = inferFlagType({ on: 'enabled', off: 'disabled' });
    expect(result).toBe('string');
  });
});
