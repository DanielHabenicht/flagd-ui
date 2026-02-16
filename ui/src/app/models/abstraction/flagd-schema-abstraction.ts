import { FlagdSchema } from '../generated/flagd-schema';
import { DisplayFlag, Environment, FlagState, FlagType } from './flagd-abstraction-models';
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
   * Context variable for timestamp comparisons in JsonLogic
   */
  private static readonly TIMESTAMP_CONTEXT_VAR = '$flagd.timestamp';
  /**
   * Factory method to create a FlagdSchemaAbstraction from a FlagdSchema
   */
  static fromSchema(schema: FlagdSchema): FlagdSchemaAbstraction {
    const newInstance = new FlagdSchemaAbstraction();
    if (schema.metadata) {
      newInstance.metadata = schema.metadata;
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

        const perEnvDefs: Record<string, any> = {};
        const environments = newInstance.getEnvironments();

        for (const timeBoundsEntry of Object.entries(timingResult.perEnvironment)) {
          const envName = timeBoundsEntry[0];
          const timeBounds = timeBoundsEntry[1];

          // Find the environment with this name (case-insensitive)
          const matchedEnv = environments.find(
            (e) => e.displayName.toLowerCase() === envName.toLowerCase(),
          );
          if (matchedEnv && (timeBounds.start !== undefined || timeBounds.end !== undefined)) {
            perEnvDefs[matchedEnv.displayName] = {
              value: FlagTypeConverter.getDefaultValueForType(flagType),
              timeWindow: {
                startTime:
                  timeBounds.start !== undefined ? new Date(timeBounds.start * 1000) : undefined,
                endTime: timeBounds.end !== undefined ? new Date(timeBounds.end * 1000) : undefined,
              },
            };
          }
        }

        if (Object.keys(perEnvDefs).length > 0) {
          (displayFlag as any).perEnvironmentDefinitions = perEnvDefs;
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

  /**
   * Get all flags from the internal state
   */
  getFlags(): DisplayFlag[] {
    return Object.values(this.flagsMap);
  }

  /**
   * Update a flag in the internal state
   * @param flagKey - The flag to update or create
   * @param updatedFlag - The updated DisplayFlag
   */
  createOrUpdateFlag(flagKey: string, updatedFlag: DisplayFlag): void {
    this.flagsMap[flagKey] = updatedFlag;
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
    for (const [flagKey, displayFlag] of Object.entries(this.flagsMap)) {
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
        flagDef.metadata = displayFlag.metadata;
      }

      // Reconstruct targeting from perEnvironmentDefinitions
      const perEnvDefs = (displayFlag as any).perEnvironmentDefinitions;
      if (perEnvDefs && Object.keys(perEnvDefs).length > 0) {
        const targeting = TimeWindowExporter.buildTargetingFromTimeWindows(perEnvDefs);
        if (targeting) {
          flagDef.targeting = targeting;
        }
      }

      flags[flagKey] = flagDef;
    }

    // Build schema
    const schema: FlagdSchema = {
      flags,
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
