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

  describe('exporting flags with time windows', () => {
    it('should export flags with perEnvironmentDefinitions containing time windows', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      // Setup environments
      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['prod', 'production'],
      });

      abstraction.createOrUpdateEnvironment({
        displayName: 'Staging',
        aliases: ['staging'],
      });

      // Create a flag with time windows for different environments
      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-12-31T23:59:59Z');
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);

      const flagWithTimeWindows = {
        type: 'boolean' as const,
        state: 'ENABLED' as const,
        value: true,
        perEnvironmentDefinitions: {
          Production: {
            value: true,
            timeWindow: {
              startTime: startDate,
              endTime: endDate,
            },
          },
          Staging: {
            value: true,
            timeWindow: {
              startTime: startDate,
              endTime: undefined,
            },
          },
        },
      };

      abstraction.createOrUpdateFlag('seasonal-feature', flagWithTimeWindows);

      // Export schema
      const schema = abstraction.exportSchema();

      // Verify flag exists with targeting
      expect(schema.flags['seasonal-feature']).toBeDefined();
      expect(schema.flags['seasonal-feature'].targeting).toBeDefined();

      // The targeting should contain environment and time conditions
      const targeting = schema.flags['seasonal-feature'].targeting as any;
      expect(targeting.if).toBeDefined();
      expect(Array.isArray(targeting.if)).toBe(true);

      // Verify the Unix timestamps are correctly converted
      const targetingStr = JSON.stringify(targeting);
      expect(targetingStr).toContain(startTimestamp.toString());
      expect(targetingStr).toContain(endTimestamp.toString());
    });

    it('should export each environment with its own time window constraints', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['production'],
      });

      abstraction.createOrUpdateEnvironment({
        displayName: 'Staging',
        aliases: ['staging'],
      });

      const prodStart = new Date('2024-01-01T00:00:00Z');
      const prodEnd = new Date('2024-06-30T23:59:59Z');
      const stagingStart = new Date('2024-07-01T00:00:00Z');
      const stagingEnd = new Date('2024-12-31T23:59:59Z');

      const prodStartTs = Math.floor(prodStart.getTime() / 1000);
      const prodEndTs = Math.floor(prodEnd.getTime() / 1000);
      const stagingStartTs = Math.floor(stagingStart.getTime() / 1000);
      const stagingEndTs = Math.floor(stagingEnd.getTime() / 1000);

      // Phased rollout: Production first, then Staging
      const phasedRollout = {
        type: 'boolean' as const,
        state: 'ENABLED' as const,
        value: false,
        perEnvironmentDefinitions: {
          Production: {
            value: true,
            timeWindow: {
              startTime: prodStart,
              endTime: prodEnd,
            },
          },
          Staging: {
            value: true,
            timeWindow: {
              startTime: stagingStart,
              endTime: stagingEnd,
            },
          },
        },
      };

      abstraction.createOrUpdateFlag('phased-feature', phasedRollout);

      const schema = abstraction.exportSchema();
      const targeting = schema.flags['phased-feature'].targeting as any;

      // Verify the structure includes if conditions for environment matching
      expect(targeting.if).toBeDefined();
      expect(targeting.if[0]).toBeDefined(); // condition
      expect(targeting.if[1]).toBeDefined(); // then value
      expect(targeting.if[2]).toBeDefined(); // else value

      // Verify the Unix timestamps are correctly converted for both environments
      const targetingStr = JSON.stringify(targeting);
      expect(targetingStr).toContain(prodStartTs.toString());
      expect(targetingStr).toContain(prodEndTs.toString());
      expect(targetingStr).toContain(stagingStartTs.toString());
      expect(targetingStr).toContain(stagingEndTs.toString());
    });

    it('should export flags with only one environment having time windows', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['production'],
      });

      abstraction.createOrUpdateEnvironment({
        displayName: 'Staging',
        aliases: ['staging'],
      });

      const startDate = new Date('2024-01-01T00:00:00Z');
      const startTimestamp = Math.floor(startDate.getTime() / 1000);

      // Only Production has a time window
      const limitedTimeWindow = {
        type: 'boolean' as const,
        state: 'ENABLED' as const,
        value: true,
        perEnvironmentDefinitions: {
          Production: {
            value: true,
            timeWindow: {
              startTime: startDate,
              endTime: undefined,
            },
          },
        },
      };

      abstraction.createOrUpdateFlag('prod-only-timed', limitedTimeWindow);

      const schema = abstraction.exportSchema();

      expect(schema.flags['prod-only-timed'].targeting).toBeDefined();
      const targeting = schema.flags['prod-only-timed'].targeting as any;

      // Should have if structure for environment checking
      expect(targeting.if).toBeDefined();

      // Verify the Unix timestamp is correctly converted
      const targetingStr = JSON.stringify(targeting);
      expect(targetingStr).toContain(startTimestamp.toString());
    });

    it('should not export targeting for flags without perEnvironmentDefinitions', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['production'],
      });

      // Flag without time windows
      const simpleFlag = {
        type: 'string' as const,
        state: 'ENABLED' as const,
        value: 'default',
      };

      abstraction.createOrUpdateFlag('simple-flag', simpleFlag);

      const schema = abstraction.exportSchema();

      expect(schema.flags['simple-flag'].targeting).toBeUndefined();
    });

    it('should export flags with time windows and preserve evaluators', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['prod', 'production'],
      });

      abstraction.createOrUpdateEnvironment({
        displayName: 'Development',
        aliases: ['dev', 'development'],
      });

      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-12-31T23:59:59Z');
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);

      const timedFlag = {
        type: 'boolean' as const,
        state: 'ENABLED' as const,
        value: false,
        perEnvironmentDefinitions: {
          Production: {
            value: true,
            timeWindow: {
              startTime: startDate,
              endTime: endDate,
            },
          },
        },
      };

      abstraction.createOrUpdateFlag('timed-feature', timedFlag);

      const schema = abstraction.exportSchema();

      // Should have both evaluators for the defined environments
      expect(schema.$evaluators).toBeDefined();
      expect(Object.keys(schema.$evaluators)).toContain('isProduction');
      expect(Object.keys(schema.$evaluators)).toContain('isDevelopment');

      // And should have targeting for the time-windowed flag
      expect(schema.flags['timed-feature'].targeting).toBeDefined();

      // Verify the Unix timestamps are correctly converted
      const targeting = schema.flags['timed-feature'].targeting as any;
      const targetingStr = JSON.stringify(targeting);
      expect(targetingStr).toContain(startTimestamp.toString());
      expect(targetingStr).toContain(endTimestamp.toString());
    });

    it('should handle empty perEnvironmentDefinitions gracefully', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['production'],
      });

      // Flag with empty perEnvironmentDefinitions
      const emptyEnvDef = {
        type: 'boolean' as const,
        state: 'ENABLED' as const,
        value: true,
        perEnvironmentDefinitions: {},
      };

      abstraction.createOrUpdateFlag('empty-env-flag', emptyEnvDef);

      const schema = abstraction.exportSchema();

      // Should not have targeting when perEnvironmentDefinitions is empty
      expect(schema.flags['empty-env-flag'].targeting).toBeUndefined();
    });

    it('should export number and string flags with time windows', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Staging',
        aliases: ['staging'],
      });

      const endDate = new Date('2024-12-31T23:59:59Z');
      const endTimestamp = Math.floor(endDate.getTime() / 1000);

      // String flag with time window
      const stringFlagWithTiming = {
        type: 'string' as const,
        state: 'ENABLED' as const,
        value: 'default',
        perEnvironmentDefinitions: {
          Staging: {
            value: 'experimental',
            timeWindow: {
              startTime: undefined,
              endTime: endDate,
            },
          },
        },
      };

      // Number flag with time window
      const numberFlagWithTiming = {
        type: 'number' as const,
        state: 'ENABLED' as const,
        value: 100,
        perEnvironmentDefinitions: {
          Staging: {
            value: 50,
            timeWindow: {
              startTime: undefined,
              endTime: endDate,
            },
          },
        },
      };

      abstraction.createOrUpdateFlag('string-timed', stringFlagWithTiming);
      abstraction.createOrUpdateFlag('number-timed', numberFlagWithTiming);

      const schema = abstraction.exportSchema();

      expect(schema.flags['string-timed'].targeting).toBeDefined();
      expect(schema.flags['number-timed'].targeting).toBeDefined();

      // Verify the Unix timestamps are correctly converted for both flags
      const stringTargeting = JSON.stringify(schema.flags['string-timed'].targeting);
      const numberTargeting = JSON.stringify(schema.flags['number-timed'].targeting);
      expect(stringTargeting).toContain(endTimestamp.toString());
      expect(numberTargeting).toContain(endTimestamp.toString());
    });

    it('should export multiple flags with different time window patterns', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      abstraction.createOrUpdateEnvironment({
        displayName: 'Production',
        aliases: ['prod'],
      });

      abstraction.createOrUpdateEnvironment({
        displayName: 'Staging',
        aliases: ['staging'],
      });

      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-12-31T23:59:59Z');
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);

      // Flag 1: Both environments with time windows
      const bothEnvFlag = {
        type: 'boolean' as const,
        state: 'ENABLED' as const,
        value: false,
        perEnvironmentDefinitions: {
          Production: {
            value: true,
            timeWindow: { startTime: startDate, endTime: endDate },
          },
          Staging: {
            value: true,
            timeWindow: { startTime: startDate, endTime: endDate },
          },
        },
      };

      // Flag 2: Only Production with time window
      const prodOnlyFlag = {
        type: 'boolean' as const,
        state: 'ENABLED' as const,
        value: false,
        perEnvironmentDefinitions: {
          Production: {
            value: true,
            timeWindow: { startTime: undefined, endTime: endDate },
          },
        },
      };

      // Flag 3: No time windows
      const noTimeFlag = {
        type: 'boolean' as const,
        state: 'ENABLED' as const,
        value: true,
      };

      abstraction.createOrUpdateFlag('both-env-timed', bothEnvFlag);
      abstraction.createOrUpdateFlag('prod-only-timed', prodOnlyFlag);
      abstraction.createOrUpdateFlag('no-time', noTimeFlag);

      const schema = abstraction.exportSchema();

      expect(schema.flags['both-env-timed'].targeting).toBeDefined();
      expect(schema.flags['prod-only-timed'].targeting).toBeDefined();
      expect(schema.flags['no-time'].targeting).toBeUndefined();

      // Verify the Unix timestamps are correctly converted
      const bothEnvTargeting = JSON.stringify(schema.flags['both-env-timed'].targeting);
      const prodOnlyTargeting = JSON.stringify(schema.flags['prod-only-timed'].targeting);

      expect(bothEnvTargeting).toContain(startTimestamp.toString());
      expect(bothEnvTargeting).toContain(endTimestamp.toString());
      expect(prodOnlyTargeting).toContain(endTimestamp.toString());
    });
  });
});
