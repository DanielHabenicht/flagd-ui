import { FlagdSchemaAbstraction } from './flagd-schema-translator.interface';
import { FlagdSchema } from '../generated/flagd-schema';

describe('FlagdSchemaAbstraction', () => {
  describe('creation from valid schemas', () => {
    it('should create from an empty but valid flagd file', () => {
      const schema: FlagdSchema = {
        flags: {},
      };

      const abstraction = new FlagdSchemaAbstraction(schema);
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

      const abstraction = new FlagdSchemaAbstraction(schema);
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

      const abstraction = new FlagdSchemaAbstraction(schema);
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
  });

  describe('creation from invalid schemas', () => {
    it('should throw when flags property is missing', () => {
      const schema = {} as FlagdSchema;

      expect(() => new FlagdSchemaAbstraction(schema)).toThrow();
    });

    it('should throw when flags is null', () => {
      const schema: FlagdSchema = {
        flags: null as any,
      };

      expect(() => new FlagdSchemaAbstraction(schema)).toThrow();
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

      const abstraction = new FlagdSchemaAbstraction(schema);
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

      const abstraction = new FlagdSchemaAbstraction(schema);
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

      const abstraction = new FlagdSchemaAbstraction(schema);
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

      const abstraction = new FlagdSchemaAbstraction(schema);
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

      const abstraction = new FlagdSchemaAbstraction(schema);
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

      const abstraction = new FlagdSchemaAbstraction(schema);
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

      const abstraction = new FlagdSchemaAbstraction(schema);
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

      const abstraction = new FlagdSchemaAbstraction(schema);
      const flags = abstraction.getFlags();

      expect(flags).toHaveLength(3);
      expect(flags.map((f) => f.type)).toContain('boolean');
      expect(flags.map((f) => f.type)).toContain('string');
      expect(flags.map((f) => f.type)).toContain('number');
    });
  });
});
