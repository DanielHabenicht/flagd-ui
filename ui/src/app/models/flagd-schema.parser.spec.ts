import { describe, it, expect } from 'vitest';
import { parseFlagdSchema, stringifyFlagdSchema } from './flagd-schema.parser';

// Simplified test schema without external references
const testSchema = {
  flags: {
    'test-flag': {
      state: 'ENABLED',
      variants: {
        on: true,
        off: false,
      },
      defaultVariant: 'off',
    },
  },
};

describe('FlagdSchemaParser', () => {
  // Test 1: Valid input
  it('should parse valid JSON string into FlagdSchema object', () => {
    const jsonString = JSON.stringify(testSchema);
    const result = parseFlagdSchema(jsonString);
    expect(result).toBeDefined();
    expect(result.flags['test-flag'].state).toBe('ENABLED');
  });

  // Test 2: Invalid input
  it('should throw error when parsing invalid schema', () => {
    const invalidJson = JSON.stringify({
      $evaluators: { someRule: { var: 'test' } },
      // missing "flags" property
    });

    expect(() => {
      parseFlagdSchema(invalidJson);
    }).toThrow();
  });

  // Test 3: Valid output
  it('should stringify valid FlagdSchema object to JSON string', () => {
    const result = stringifyFlagdSchema(testSchema as any);
    expect(typeof result).toBe('string');
    expect(result).toContain('test-flag');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  // Test 4: Invalid output
  it('should throw error when stringifying invalid schema object', () => {
    const invalidObject = {
      flags: {
        'test-flag': {
          state: 'INVALID_STATE',
          variants: { on: true },
        },
      },
    };

    expect(() => {
      stringifyFlagdSchema(invalidObject as any);
    }).toThrow();
  });
});
