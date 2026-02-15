import { FlagdSchemaAbstraction } from './flagd-schema-abstraction';
import { FlagdSchema } from '../generated/flagd-schema';

describe('FlagdSchemaAbstraction - Internal Use (without import or exporting JsondSchema)', () => {
  describe('createOrUpdateEnvironment', () => {
    it('should add a new environment to an empty abstraction', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['prod', 'production'],
      });

      const environments = abstraction.getEnvironments();
      expect(environments).toHaveLength(1);
      expect(environments[0]).toEqual({
        displayName: 'Production',
        aliases: ['prod', 'production'],
      });
    });

    it('should add multiple environments', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['prod', 'production'],
      });

      abstraction.createOrUpdateEnvironment({
        displayName: 'Staging',
        aliases: ['staging', 'stage'],
      });

      const environments = abstraction.getEnvironments();
      expect(environments).toHaveLength(2);
      expect(environments.map((e) => e.displayName)).toContain('Production');
      expect(environments.map((e) => e.displayName)).toContain('Staging');
    });

    it('should update an existing environment', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['prod'],
      });

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['prod', 'production', 'prd'],
      });

      const environments = abstraction.getEnvironments();
      expect(environments).toHaveLength(1);
      expect(environments[0].aliases).toEqual(['prod', 'production', 'prd']);
    });
  });

  describe('createOrUpdateFlag', () => {
    it('should add a new boolean flag to an empty abstraction', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateFlag('feature-flag', {
        type: 'boolean',
        state: 'ENABLED',
        value: true,
      });

      const flags = abstraction.getFlags();
      expect(flags).toHaveLength(1);
      expect(flags[0].type).toBe('boolean');
      expect(flags[0].state).toBe('ENABLED');
      expect(flags[0].value).toBe(true);
    });

    it('should add a new string flag', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateFlag('color-flag', {
        type: 'string',
        state: 'ENABLED',
        value: 'red',
      });

      const flags = abstraction.getFlags();
      expect(flags).toHaveLength(1);
      expect(flags[0].type).toBe('string');
      expect(flags[0].value).toBe('red');
    });

    it('should add a new number flag', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateFlag('threshold-flag', {
        type: 'number',
        state: 'ENABLED',
        value: 42,
      });

      const flags = abstraction.getFlags();
      expect(flags).toHaveLength(1);
      expect(flags[0].type).toBe('number');
      expect(flags[0].value).toBe(42);
    });

    it('should add a new object flag', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateFlag('config-flag', {
        type: 'object',
        state: 'ENABLED',
        value: { key: 'value' },
      });

      const flags = abstraction.getFlags();
      expect(flags).toHaveLength(1);
      expect(flags[0].type).toBe('object');
      expect(flags[0].value).toEqual({ key: 'value' });
    });

    it('should add a flag with metadata', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateFlag('feature-flag', {
        type: 'boolean',
        state: 'ENABLED',
        value: true,
        metadata: {
          owner: 'team-a',
          priority: 1,
        },
      });

      const flags = abstraction.getFlags();
      expect(flags[0].metadata).toEqual({
        owner: 'team-a',
        priority: 1,
      });
    });

    it('should update an existing flag', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateFlag('feature-flag', {
        type: 'boolean',
        state: 'ENABLED',
        value: true,
      });

      abstraction.createOrUpdateFlag('feature-flag', {
        type: 'boolean',
        state: 'DISABLED',
        value: false,
      });

      const flags = abstraction.getFlags();
      expect(flags).toHaveLength(1);
      expect(flags[0].state).toBe('DISABLED');
      expect(flags[0].value).toBe(false);
    });

    it('should add multiple flags', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateFlag('bool-flag', {
        type: 'boolean',
        state: 'ENABLED',
        value: true,
      });

      abstraction.createOrUpdateFlag('string-flag', {
        type: 'string',
        state: 'ENABLED',
        value: 'active',
      });

      abstraction.createOrUpdateFlag('number-flag', {
        type: 'number',
        state: 'ENABLED',
        value: 100,
      });

      const flags = abstraction.getFlags();
      expect(flags).toHaveLength(3);
      expect(flags.map((f) => f.type)).toContain('boolean');
      expect(flags.map((f) => f.type)).toContain('string');
      expect(flags.map((f) => f.type)).toContain('number');
    });
  });

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
