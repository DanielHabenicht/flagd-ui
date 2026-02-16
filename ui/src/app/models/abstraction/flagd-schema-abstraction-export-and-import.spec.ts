import { FlagdSchemaAbstraction } from './flagd-schema-abstraction';
import { FlagdSchema } from '../generated/flagd-schema';

describe('FlagdSchemaAbstraction - Through Importing and Export JsondSchema', () => {
  describe('generateSchema', () => {
    it('should generate a valid FlagdSchema from the internal state', () => {
      const inputSchema: FlagdSchema = {
        flags: {
          'feature-flag': {
            state: 'ENABLED',
            variants: {
              on: true,
              off: false,
            },
            defaultVariant: 'on',
            metadata: {
              owner: 'team-a',
              priority: 1,
            },
          },
          'color-flag': {
            state: 'DISABLED',
            variants: {
              red: 'red',
              blue: 'blue',
            },
            defaultVariant: 'blue',
          },
        },
        $evaluators: {
          isProduction: {
            in: [{ var: 'environment' }, ['prod', 'production']],
          },
          isStaging: {
            in: [{ var: 'environment' }, ['staging', 'stage']],
          },
        },
        metadata: {
          flagSetId: 'test-set',
          version: '1.0.0',
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const generatedSchema = abstraction.exportSchema();

      expect(generatedSchema).toBeDefined();
      expect(generatedSchema.flags).toBeDefined();
      expect(generatedSchema.metadata).toEqual({
        flagSetId: 'test-set',
        version: '1.0.0',
      });
      expect(generatedSchema.$evaluators).toBeDefined();
      if (generatedSchema.$evaluators) {
        expect(Object.keys(generatedSchema.$evaluators)).toContain('isProduction');
        expect(Object.keys(generatedSchema.$evaluators)).toContain('isStaging');
      }
      expect(Object.keys(generatedSchema.flags)).toContain('feature-flag');
      expect(Object.keys(generatedSchema.flags)).toContain('color-flag');
    });
  });

  describe('round-trip export and import with global value definitions', () => {
    it('should preserve flags with global time window targeting through round-trip', () => {
      // Start with a schema that has global time window targeting
      const inputSchema: FlagdSchema = {
        flags: {
          'global-timed-flag': {
            state: 'ENABLED',
            variants: {
              default: 'global-variant',
              alt: 'alt-variant',
            },
            defaultVariant: 'default',
            targeting: {
              if: [
                {
                  and: [
                    { '>=': [{ var: '$flagd.timestamp' }, 1704067200] },
                    { '<=': [{ var: '$flagd.timestamp' }, 1735689599] },
                  ],
                },
                'global-variant',
                'alt-variant',
              ],
            },
          },
        },
      };

      // Import from schema
      const imported = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = imported.getFlags();

      expect(flags).toHaveLength(1);
      expect(flags[0].globalTimeWindow).toBeDefined();
      expect(flags[0].globalTimeWindow?.timeWindow).toBeDefined();

      // Export back to schema
      const exported = imported.exportSchema();
      expect(exported.flags['global-timed-flag']).toBeDefined();
      expect(exported.flags['global-timed-flag'].targeting).toBeDefined();
    });

    it('should handle environmental targeting with global time windows', () => {
      const inputSchema: FlagdSchema = {
        flags: {
          'env-and-time-flag': {
            state: 'ENABLED',
            variants: {
              on: true,
              off: false,
            },
            defaultVariant: 'on',
            targeting: {
              if: [
                {
                  and: [
                    { '>=': [{ var: '$flagd.timestamp' }, 1704067200] },
                    { '<=': [{ var: '$flagd.timestamp' }, 1735689599] },
                  ],
                },
                true,
                {
                  if: [
                    {
                      and: [
                        { in: [{ var: 'environment' }, ['prod']] },
                        { '>=': [{ var: '$flagd.timestamp' }, 1717200000] },
                      ],
                    },
                    true,
                    false,
                  ],
                },
              ],
            },
          },
        },
        $evaluators: {
          isProduction: {
            in: [{ var: 'environment' }, ['prod']],
          },
        },
      };

      const imported = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = imported.getFlags();

      expect(flags).toHaveLength(1);
      expect(flags[0].globalTimeWindow).toBeDefined();

      // Re-export should maintain targeting structure
      const exported = imported.exportSchema();
      expect(exported.flags['env-and-time-flag'].targeting).toBeDefined();
    });
  });
});
