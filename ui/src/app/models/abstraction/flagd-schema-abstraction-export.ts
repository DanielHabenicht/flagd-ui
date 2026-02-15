import { FlagdSchemaAbstraction } from './flagd-schema-abstraction';
import { FlagdSchema } from '../generated/flagd-schema';

describe('FlagdSchemaAbstraction - FlagdSchema Generation for Output', () => {
  describe('combined createOrUpdate operations', () => {
    it('should allow building a schema from scratch using createOrUpdate methods', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      // Add environments
      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['prod', 'production'],
      });

      abstraction.createOrUpdateEnvironment({
        displayName: 'Staging',
        aliases: ['staging', 'stage'],
      });

      // Add flags
      abstraction.createOrUpdateFlag('feature-a', {
        type: 'boolean',
        state: 'ENABLED',
        value: true,
      });

      abstraction.createOrUpdateFlag('feature-b', {
        type: 'string',
        state: 'ENABLED',
        value: 'variant-1',
      });

      // Verify state
      expect(abstraction.getEnvironments()).toHaveLength(2);
      expect(abstraction.getFlags()).toHaveLength(2);

      // Generate schema
      const schema = abstraction.exportSchema();
      expect(Object.keys(schema.flags)).toContain('feature-a');
      expect(Object.keys(schema.flags)).toContain('feature-b');
      expect(schema.$evaluators).toBeDefined();
      expect(Object.keys(schema.$evaluators)).toHaveLength(2);
    });
  });
});
