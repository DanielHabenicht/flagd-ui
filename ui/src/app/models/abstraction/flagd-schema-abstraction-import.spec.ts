import { FlagdSchemaAbstraction } from './flagd-schema-abstraction';
import { FlagdSchema } from '../generated/flagd-schema';

describe('FlagdSchemaAbstraction', () => {
  describe('creation from valid schemas', () => {
    it('should create from an empty but valid flagd file', () => {
      const schema: FlagdSchema = {
        flags: {},
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      expect(abstraction).toBeDefined();
    });

    it('should create from a flagd file with metadata', () => {
      const schema: FlagdSchema = {
        flags: {},
        metadata: {
          flagSetId: 'test-set',
          version: '1.0.0',
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      expect(abstraction).toBeDefined();
    });

    it('should create from a flagd file with evaluators', () => {
      const schema: FlagdSchema = {
        flags: {},
        $evaluators: {
          isProduction: {
            in: [{ var: 'environment' }, ['prod', 'production']],
          },
          isStaging: {
            in: [{ var: 'environment' }, ['staging', 'stage']],
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      const environments = abstraction.getEnvironments();

      expect(environments).toHaveLength(2);
      expect(environments).toContainEqual({
        displayName: 'Production',
        aliases: ['prod', 'production'],
      });
      expect(environments).toContainEqual({
        displayName: 'Staging',
        aliases: ['staging', 'stage'],
      });
    });

    it('should handle flags with metadata alongside environments', () => {
      const inputSchema: FlagdSchema = {
        flags: {
          'metadata-flag': {
            state: 'ENABLED',
            variants: { on: true, off: false },
            defaultVariant: 'on',
            metadata: {
              owner: 'platform-team',
              description: 'Test flag with metadata',
            },
          },
        },
        $evaluators: {
          isProduction: {
            in: [{ var: 'environment' }, ['production']],
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = abstraction.getFlags();

      expect(flags[0].metadata).toEqual({
        owner: 'platform-team',
        description: 'Test flag with metadata',
      });
    });

    it('should handle flags with multiple environments', () => {
      const inputSchema: FlagdSchema = {
        flags: {
          'api-timeout-ms': {
            defaultVariant: 'default',
            state: 'ENABLED',
            targeting: {
              if: [
                {
                  $ref: 'isProduction',
                },
                'production',
                {
                  if: [
                    {
                      $ref: 'isStaging',
                    },
                    'staging',
                    {
                      if: [
                        {
                          $ref: 'isDevelopment',
                        },
                        'development',
                        'default',
                      ],
                    },
                  ],
                },
              ],
            },
            variants: {
              default: 5000,
              development: 1000,
              production: 5000,
              staging: 3000,
            },
          },
        },
        $evaluators: {
          isDevelopment: {
            in: [
              {
                var: 'environment',
              },
              ['dev', 'development', 'local'],
            ],
          },
          isProduction: {
            in: [
              {
                var: 'environment',
              },
              ['prod', 'production'],
            ],
          },
          isStaging: {
            in: [
              {
                var: 'environment',
              },
              ['staging', 'stage'],
            ],
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = abstraction.getFlags();
      const abstractedEnvironments = abstraction.getEnvironments();

      expect(abstractedEnvironments).toHaveLength(3);
      expect(abstractedEnvironments).toContainEqual({
        displayName: 'Development',
        aliases: ['dev', 'development', 'local'],
      });
      expect(abstractedEnvironments).toContainEqual({
        displayName: 'Production',
        aliases: ['prod', 'production'],
      });
      expect(abstractedEnvironments).toContainEqual({
        displayName: 'Staging',
        aliases: ['staging', 'stage'],
      });

      expect(flags).toHaveLength(1);

      expect(Object.keys(flags[0].perEnvironmentDefinitions)).toHaveLength(3);
      expect(flags[0].perEnvironmentDefinitions['Development']).toEqual({
        value: 1000,
      });
      expect(flags[0].perEnvironmentDefinitions['Production']).toEqual({
        value: 5000,
      });
      expect(flags[0].perEnvironmentDefinitions['Staging']).toEqual({
        value: 3000,
      });
    });
  });

  describe('creation from invalid schemas', () => {
    it('should throw when flags property is missing', () => {
      const schema = {} as FlagdSchema;

      expect(() => FlagdSchemaAbstraction.fromSchema(schema)).toThrow();
    });

    it('should throw when flags is null', () => {
      const schema: FlagdSchema = {
        flags: null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      };

      expect(() => FlagdSchemaAbstraction.fromSchema(schema)).toThrow();
    });
  });

  describe('boolean flag type', () => {
    it('should parse boolean variants correctly', () => {
      const schema: FlagdSchema = {
        flags: {
          'feature-flag': {
            state: 'ENABLED',
            variants: {
              on: true,
              off: false,
            },
            defaultVariant: 'on',
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(1);
      expect(flags[0].type).toBe('boolean');
      expect(flags[0].state).toBe('ENABLED');
      expect(flags[0].value).toBe(true);
    });

    it('should have null value if no defaultVariant is set', () => {
      const schema: FlagdSchema = {
        flags: {
          'feature-flag': {
            state: 'ENABLED',
            variants: {
              off: false,
              on: true,
            },
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      const flags = abstraction.getFlags();

      expect(flags[0].value).toBe(null);
    });
  });

  describe('string flag type', () => {
    it('should parse string variants correctly', () => {
      const schema: FlagdSchema = {
        flags: {
          'color-flag': {
            state: 'ENABLED',
            variants: {
              red: 'red',
              blue: 'blue',
              green: 'green',
            },
            defaultVariant: 'blue',
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(1);
      expect(flags[0].type).toBe('string');
      expect(flags[0].value).toBe('blue');
    });
  });

  describe('number flag type', () => {
    it('should parse number variants correctly', () => {
      const schema: FlagdSchema = {
        flags: {
          'threshold-flag': {
            state: 'ENABLED',
            variants: {
              low: 10,
              medium: 50,
              high: 100,
            },
            defaultVariant: 'medium',
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(1);
      expect(flags[0].type).toBe('number');
      expect(flags[0].value).toBe(50);
    });
  });

  describe('object flag type', () => {
    it('should parse object variants correctly', () => {
      const schema: FlagdSchema = {
        flags: {
          'config-flag': {
            state: 'ENABLED',
            variants: {
              variantA: { setting: 'valueA' },
              variantB: { setting: 'valueB' },
            },
            defaultVariant: 'variantA',
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(1);
      expect(flags[0].type).toBe('object');
      expect(flags[0].value).toEqual({ setting: 'valueA' });
    });
  });

  describe('flag metadata', () => {
    it('should preserve flag metadata', () => {
      const schema: FlagdSchema = {
        flags: {
          'featured-flag': {
            state: 'ENABLED',
            variants: {
              on: true,
              off: false,
            },
            metadata: {
              owner: 'team-a',
              priority: 1,
              experimental: false,
            },
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      const flags = abstraction.getFlags();

      expect(flags[0].metadata).toEqual({
        owner: 'team-a',
        priority: 1,
        experimental: false,
      });
    });
  });

  describe('disabled flags', () => {
    it('should preserve disabled state', () => {
      const schema: FlagdSchema = {
        flags: {
          'disabled-flag': {
            state: 'DISABLED',
            variants: {
              on: true,
              off: false,
            },
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      const flags = abstraction.getFlags();

      expect(flags[0].state).toBe('DISABLED');
    });
  });

  describe('multiple flags', () => {
    it('should parse multiple flags of different types', () => {
      const schema: FlagdSchema = {
        flags: {
          'bool-flag': {
            state: 'ENABLED',
            variants: { on: true, off: false },
            defaultVariant: 'on',
          },
          'string-flag': {
            state: 'ENABLED',
            variants: { a: 'variant-a', b: 'variant-b' },
            defaultVariant: 'a',
          },
          'number-flag': {
            state: 'ENABLED',
            variants: { small: 1, large: 100 },
            defaultVariant: 'small',
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(3);
      expect(flags.map((f) => f.type)).toContain('boolean');
      expect(flags.map((f) => f.type)).toContain('string');
      expect(flags.map((f) => f.type)).toContain('number');
    });
  });
  describe('empty', () => {
    it('should create an empty instance with no flags', () => {
      const abstraction = FlagdSchemaAbstraction.empty();

      expect(abstraction).toBeDefined();
      expect(abstraction.getFlags()).toHaveLength(0);
      expect(abstraction.getEnvironments()).toHaveLength(0);
    });
  });

  describe('time windows per environment', () => {
    it('should handle time windows with start and end time', () => {
      const startTime = 1704067200; // Unix timestamp
      const endTime = 1735689599; // Unix timestamp

      const inputSchema: FlagdSchema = {
        flags: {
          'seasonal-feature': {
            state: 'ENABLED',
            variants: { on: true, off: false },
            defaultVariant: 'off',
            targeting: {
              if: [
                {
                  and: [
                    { in: [{ var: 'environment' }, ['production']] },
                    {
                      and: [
                        { '>=': [{ var: '$flagd.timestamp' }, startTime] },
                        { '<=': [{ var: '$flagd.timestamp' }, endTime] },
                      ],
                    },
                  ],
                },
                'on',
                'off',
              ],
            } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          },
        },
        $evaluators: {
          isProduction: {
            in: [{ var: 'environment' }, ['production']],
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perEnvDefs = (flags[0] as any).perEnvironmentDefinitions;

      // Time windows were extracted and populated
      expect(perEnvDefs['Production']).toBeDefined();
      expect(perEnvDefs['Production'].timeWindow).toBeDefined();
      expect(perEnvDefs['Production'].timeWindow.startTime).toEqual(new Date(startTime * 1000));
      expect(perEnvDefs['Production'].timeWindow.endTime).toEqual(new Date(endTime * 1000));
    });

    it('should handle time window with only start time', () => {
      const startTime = 1704067200;

      const inputSchema: FlagdSchema = {
        flags: {
          'future-feature': {
            state: 'ENABLED',
            variants: { on: true, off: false },
            defaultVariant: 'off',
            targeting: {
              if: [
                {
                  and: [
                    { in: [{ var: 'environment' }, ['staging']] },
                    { '>=': [{ var: '$flagd.timestamp' }, startTime] },
                  ],
                },
                'on',
                'off',
              ],
            } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          },
        },
        $evaluators: {
          isStaging: {
            in: [{ var: 'environment' }, ['staging']],
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = abstraction.getFlags();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perEnvDefs = (flags[0] as any).perEnvironmentDefinitions;
      expect(perEnvDefs['Staging'].timeWindow?.startTime).toEqual(new Date(startTime * 1000));
      expect(perEnvDefs['Staging'].timeWindow?.endTime).toBeUndefined();
    });

    it('should handle time window with only end time', () => {
      const endTime = 1735689599;

      const inputSchema: FlagdSchema = {
        flags: {
          'scheduled-feature': {
            state: 'ENABLED',
            variants: { on: true, off: false },
            defaultVariant: 'off',
            targeting: {
              if: [
                {
                  and: [
                    { in: [{ var: 'environment' }, ['staging']] },
                    { '<=': [{ var: '$flagd.timestamp' }, endTime] },
                  ],
                },
                'on',
                'off',
              ],
            } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          },
        },
        $evaluators: {
          isStaging: {
            in: [{ var: 'environment' }, ['staging']],
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = abstraction.getFlags();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perEnvDefs = (flags[0] as any).perEnvironmentDefinitions;
      expect(perEnvDefs['Staging'].timeWindow?.startTime).toBeUndefined();
      expect(perEnvDefs['Staging'].timeWindow?.endTime).toEqual(new Date(endTime * 1000));
    });
  });

  describe('importing flags with global value definitions', () => {
    it('should import flags with global time window targeting', () => {
      const startTime = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-12-31T23:59:59Z').getTime() / 1000);

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
                    { '>=': [{ var: '$flagd.timestamp' }, startTime] },
                    { '<=': [{ var: '$flagd.timestamp' }, endTime] },
                  ],
                },
                'default',
                'alt',
              ],
            },
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(1);
      const flag = flags[0];
      expect(flag.globalTimeWindow).toBeDefined();
      expect(flag.globalTimeWindow?.timeWindow).toBeDefined();
      expect(flag.globalTimeWindow?.timeWindow?.startTime).toEqual(new Date(startTime * 1000));
      expect(flag.globalTimeWindow?.timeWindow?.endTime).toEqual(new Date(endTime * 1000));
    });

    it('should parse global targeting with environment conditions', () => {
      const globalStartTime = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000);
      const globalEndTime = Math.floor(new Date('2024-12-31T23:59:59Z').getTime() / 1000);
      const prodStartTime = Math.floor(new Date('2024-06-01T00:00:00Z').getTime() / 1000);

      const inputSchema: FlagdSchema = {
        flags: {
          'combined-flag': {
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
                    { '>=': [{ var: '$flagd.timestamp' }, globalStartTime] },
                    { '<=': [{ var: '$flagd.timestamp' }, globalEndTime] },
                  ],
                },
                'on',
                {
                  if: [
                    {
                      and: [
                        { $ref: 'isProduction' },
                        { '>=': [{ var: '$flagd.timestamp' }, prodStartTime] },
                      ],
                    },
                    'on',
                    'off',
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

      const abstraction = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(1);
      const flag = flags[0];

      // Check global definition is parsed
      expect(flag.globalTimeWindow).toBeDefined();
      expect(flag.globalTimeWindow?.timeWindow).toBeDefined();

      // Check per-environment definitions are populated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perEnvDefs = (flag as any).perEnvironmentDefinitions;
      expect(Object.keys(perEnvDefs).length).toBeGreaterThan(0);
    });

    it('should handle flags with only global definition (no time window)', () => {
      const inputSchema: FlagdSchema = {
        flags: {
          'simple-global-flag': {
            state: 'ENABLED',
            variants: {
              enabled: true,
              disabled: false,
            },
            defaultVariant: 'enabled',
          },
        },
      };

      const abstraction = FlagdSchemaAbstraction.fromSchema(inputSchema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(1);
      const flag = flags[0];

      // Without targeting, globalValueDefinition should be undefined
      expect(flag.globalTimeWindow).toBeUndefined();
    });
  });
});
