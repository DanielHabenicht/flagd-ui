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
      expect(Object.keys(generatedSchema.$evaluators)).toContain('isProduction');
      expect(Object.keys(generatedSchema.$evaluators)).toContain('isStaging');
      expect(Object.keys(generatedSchema.flags)).toContain('feature-flag');
      expect(Object.keys(generatedSchema.flags)).toContain('color-flag');
    });
  });
});
