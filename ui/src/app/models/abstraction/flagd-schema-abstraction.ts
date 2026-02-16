import { FlagdSchema } from '../generated/flagd-schema';
import {
  DisplayFlag,
  Environment,
  FlagState,
  FlagType,
  ValueDefinition,
} from './flagd-abstraction-models';
import { JSONLOGIC_IN_OPERATOR, JSONLOGIC_VAR_PROPERTY } from './flagd-constants';
import {
  TimeWindowExporter,
  TimeWindowImporter,
  FlagTypeConverter,
} from './flagd-schema-abstraction-converters';

/**
 * Abstraction layer for FlagdSchema
 *
 * This class is responsible for:
 * - Parsing a FlagdSchema into an internal representation suitable for frontend display and editing
 */
export class FlagdSchemaAbstraction {
  /**
   * Prefix used for environment evaluators
   * Example: "isProduction", "isStaging"
   */
  private static readonly ENVIRONMENT_EVALUATOR_PREFIX = 'is';

  /**
   * The name of the environment context variable
   */
  private static readonly ENVIRONMENT_VAR_NAME = 'environment';

  /**
   * The variant name for boolean 'true' values in flag schemas
   */
  private static readonly BOOLEAN_ON_VARIANT = 'on';

  /**
   * The default variant name for non-boolean flags
   */
  private static readonly DEFAULT_VARIANT = 'default';

  /**
   * Factory method to create a FlagdSchemaAbstraction from a FlagdSchema
   */
  static fromSchema(schema: FlagdSchema): FlagdSchemaAbstraction {
    const newInstance = new FlagdSchemaAbstraction();
    if (schema.metadata) {
      // Filter out undefined values from FlagSetMetadata
      newInstance.metadata = Object.fromEntries(
        Object.entries(schema.metadata).filter(([, v]) => v !== undefined),
      ) as Record<string, string | number | boolean>;
    }

    // Extract environments from evaluators FIRST
    if (schema.$evaluators) {
      for (const [key, evaluator] of Object.entries(schema.$evaluators)) {
        // Check if this is an environment evaluator (pattern: "isXxx")
        if (
          key.startsWith(FlagdSchemaAbstraction.ENVIRONMENT_EVALUATOR_PREFIX) &&
          typeof evaluator === 'object' &&
          evaluator !== null
        ) {
          const inOperator = (evaluator as Record<string, unknown>)[JSONLOGIC_IN_OPERATOR];
          if (Array.isArray(inOperator) && inOperator.length === 2) {
            const varCheck = inOperator[0];
            const aliases = inOperator[1];

            // Verify it's checking the "environment" variable
            if (
              typeof varCheck === 'object' &&
              varCheck !== null &&
              (varCheck as Record<string, unknown>)[JSONLOGIC_VAR_PROPERTY] ===
                FlagdSchemaAbstraction.ENVIRONMENT_VAR_NAME &&
              Array.isArray(aliases)
            ) {
              const envName = key.slice(FlagdSchemaAbstraction.ENVIRONMENT_EVALUATOR_PREFIX.length); // Remove prefix
              newInstance.environmentAliases[envName.toLowerCase()] = aliases.map(String);
            }
          }
        }
      }
    }

    // Parse each flag
    for (const [flagKey, flagDef] of Object.entries(schema.flags)) {
      // Infer flag type from variants
      let flagType: FlagType = 'object';
      const variantValues = Object.values(flagDef.variants);
      if (variantValues.length > 0) {
        const first = variantValues[0];
        if (typeof first === 'boolean') {
          flagType = 'boolean';
        } else if (typeof first === 'number') {
          flagType = 'number';
        } else if (typeof first === 'string') {
          flagType = 'string';
        }
      }

      const displayFlag: DisplayFlag = {
        key: flagKey,
        type: flagType,
        state: flagDef.state as FlagState,
        value: flagDef.defaultVariant ? flagDef.variants[flagDef.defaultVariant] : null,
      } as DisplayFlag;

      if (flagDef.metadata) {
        displayFlag.metadata = flagDef.metadata;
      }

      // Parse time windows from targeting and populate perEnvironmentDefinitions
      if (typeof flagDef.targeting === 'object' && flagDef.targeting !== null) {
        const targeting = flagDef.targeting as Record<string, unknown>;
        const timingResult = TimeWindowImporter.parseEnvironmentTimingTargeting(targeting);

        // Handle global value definition
        if (timingResult.global && timingResult.global.timeWindow) {
          displayFlag.globalTimeWindow = {
            value: FlagTypeConverter.getDefaultValueForType(flagType) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            timeWindow: {
              startTime:
                timingResult.global.timeWindow.start !== undefined
                  ? new Date(timingResult.global.timeWindow.start * 1000)
                  : undefined,
              endTime:
                timingResult.global.timeWindow.end !== undefined
                  ? new Date(timingResult.global.timeWindow.end * 1000)
                  : undefined,
            },
          };
        }

        // Handle per-environment definitions
        const perEnvDefs: Record<string, ValueDefinition<unknown>> = {};
        const environments = newInstance.getEnvironments();

        for (const envEntry of Object.entries(timingResult.perEnvironment)) {
          const envName = envEntry[0];
          const envData = envEntry[1];

          // Find the environment with this name (case-insensitive)
          const matchedEnv = environments.find(
            (e) => e.displayName.toLowerCase() === envName.toLowerCase(),
          );

          if (matchedEnv) {
            // Get the value - either from variant or use default
            let envValue: unknown = FlagTypeConverter.getDefaultValueForType(flagType);
            if (envData.variant && typeof envData.variant === 'string') {
              // Look up the variant value from the flag's variants
              envValue = flagDef.variants[envData.variant];
            }

            perEnvDefs[matchedEnv.displayName] = {
              value: envValue,
            };

            // Add time window if it exists
            if (envData.start !== undefined || envData.end !== undefined) {
              perEnvDefs[matchedEnv.displayName].timeWindow = {
                startTime: envData.start !== undefined ? new Date(envData.start * 1000) : undefined,
                endTime: envData.end !== undefined ? new Date(envData.end * 1000) : undefined,
              };
            }
          }
        }

        if (Object.keys(perEnvDefs).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (displayFlag as any).perEnvironmentDefinitions = perEnvDefs as Record<
            string,
            ValueDefinition<unknown>
          >;
        }
      }

      newInstance.flagsMap[flagKey] = displayFlag;
    }
    return newInstance;
  }

  /**
   * Factory method to create an empty FlagdSchemaAbstraction with no flags or environments
   */
  static empty(): FlagdSchemaAbstraction {
    return new FlagdSchemaAbstraction();
  }

  /**
   * Mapping of environment aliases to their display names for easy lookup and management
   */
  private environmentAliases: Record<string, string[]> = {};

  /**
   * Internal representation of flags, keyed by flag key, with associated DisplayFlagEntry for easy access and updates
   */
  private flagsMap: Record<string, DisplayFlag> = {};

  private metadata?: Record<string, string | number | boolean>;

  private constructor() {
    /* empty */
  }

  setMetadata(metadata: Record<string, string | number | boolean>): void {
    this.metadata = metadata;
  }

  getMetadata(): Record<string, string | number | boolean> | undefined {
    return this.metadata;
  }

  /**
   * Get the list of environments based on the current internal state, ensuring display names and aliases are properly represented
   */
  getEnvironments(): Environment[] {
    return Object.entries(this.environmentAliases).map(([name, aliases]) => ({
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      aliases,
    }));
  }

  createOrUpdateEnvironment(environment: Environment): void {
    const envKey = environment.displayName.toLowerCase();
    this.environmentAliases[envKey] = environment.aliases;
  }

  deleteEnvironment(displayName: string): void {
    const envKey = displayName.toLowerCase();
    delete this.environmentAliases[envKey];
  }

  /**
   * Get all flags from the internal state
   */
  getFlags(): DisplayFlag[] {
    return Object.values(this.flagsMap);
  }

  getFlagByKey(flagKey: string): DisplayFlag | undefined {
    return this.flagsMap[flagKey];
  }

  /**
   * Update a flag in the internal state
   * @param updatedFlag - The updated DisplayFlag (must include the 'key' property)
   * @param previousKey - Optional previous key if renaming a flag
   */
  createOrUpdateFlag(updatedFlag: DisplayFlag, previousKey?: string): void {
    // If previousKey is provided and different from current key, remove the old entry
    if (previousKey && previousKey !== updatedFlag.key && this.flagsMap[previousKey]) {
      delete this.flagsMap[previousKey];
    }
    this.flagsMap[updatedFlag.key] = updatedFlag;
  }

  deleteFlag(flagKey: string): void {
    delete this.flagsMap[flagKey];
  }

  /**
   * Generate a FlagdSchema from the internal state
   */
  exportSchema(): FlagdSchema {
    // Build evaluators from environment aliases
    const evaluators: Record<string, Record<string, unknown>> = {};
    for (const [envName, aliases] of Object.entries(this.environmentAliases)) {
      const refKey =
        FlagdSchemaAbstraction.ENVIRONMENT_EVALUATOR_PREFIX +
        envName.charAt(0).toUpperCase() +
        envName.slice(1);
      evaluators[refKey] = {
        [JSONLOGIC_IN_OPERATOR]: [
          { [JSONLOGIC_VAR_PROPERTY]: FlagdSchemaAbstraction.ENVIRONMENT_VAR_NAME },
          aliases,
        ],
      };
    }

    // Build flags from flagsMap
    const flags: Record<string, Record<string, unknown>> = {};
    for (const displayFlag of Object.values(this.flagsMap)) {
      const flagKey = displayFlag.key;
      const variants: Record<string, unknown> = {};

      // Determine the variant key based on flag type
      const variantKey =
        displayFlag.type === 'boolean'
          ? FlagdSchemaAbstraction.BOOLEAN_ON_VARIANT
          : FlagdSchemaAbstraction.DEFAULT_VARIANT;

      // For now, create a single variant with the current value
      variants[variantKey] = displayFlag.value;

      const flagDef: Record<string, unknown> = {
        state: displayFlag.state,
        variants,
        defaultVariant: variantKey,
      };

      if (displayFlag.metadata && Object.keys(displayFlag.metadata).length > 0) {
        flagDef['metadata'] = displayFlag.metadata;
      }

      // Reconstruct targeting from perEnvironmentDefinitions and/or globalValueDefinition
      const perEnvDefs = displayFlag.perEnvironmentDefinitions;
      const globalValueDef = displayFlag.globalTimeWindow;

      // Build targeting if there are per-environment definitions OR a global value definition with time window
      const hasPerEnvDefs = perEnvDefs && Object.keys(perEnvDefs).length > 0;
      const hasGlobalTimeWindow = globalValueDef && globalValueDef.timeWindow;

      if (hasPerEnvDefs || hasGlobalTimeWindow) {
        const targeting = TimeWindowExporter.buildTargetingFromTimeWindows(
          perEnvDefs || {},
          globalValueDef,
        );
        if (targeting) {
          flagDef['targeting'] = targeting;
        }
      }

      flags[flagKey] = flagDef;
    }

    // Build schema
    const schema: FlagdSchema = {
      flags: flags as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    };

    if (Object.keys(evaluators).length > 0) {
      schema.$evaluators = evaluators;
    }

    if (this.metadata && Object.keys(this.metadata).length > 0) {
      schema.metadata = this.metadata;
    }

    return schema;
  }
}
