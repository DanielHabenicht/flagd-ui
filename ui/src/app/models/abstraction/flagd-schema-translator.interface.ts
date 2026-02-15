/**
 * FlagdSchemaTranslator - Core abstraction layer
 *
 * Manages translation between:
 * - FlagdSchema (raw OpenFeature schema) - held in internal state
 * - DisplayFlag (frontend display/edit models)
 *
 * This class ensures translation logic is isolated and testable.
 */

import { FlagdSchema } from '../generated/flagd-schema';
import { DisplayFlag, Environment, FlagState, FlagType } from './flagd-translator.models';

export class FlagdSchemaAbstraction {
  /**
   * Mapping of environment aliases to their display names for easy lookup and management
   */
  private environmentAliases: Record<string, string[]> = {};

  /**
   * Internal representation of flags, keyed by flag key, with associated DisplayFlagEntry for easy access and updates
   */
  private flagsMap: Record<string, DisplayFlag> = {};
  private metadata?: Record<string, string | number | boolean>;

  constructor(schema: FlagdSchema) {
    // Store metadata if present
    if (schema.metadata) {
      this.metadata = schema.metadata;
    }

    // Extract environments from evaluators
    if (schema.$evaluators) {
      for (const [key, evaluator] of Object.entries(schema.$evaluators)) {
        // Check if this is an environment evaluator (pattern: "isXxx")
        if (key.startsWith('is') && typeof evaluator === 'object' && evaluator !== null) {
          const inOperator = (evaluator as Record<string, unknown>)['in'];
          if (Array.isArray(inOperator) && inOperator.length === 2) {
            const varCheck = inOperator[0];
            const aliases = inOperator[1];

            // Verify it's checking the "environment" variable
            if (
              typeof varCheck === 'object' &&
              varCheck !== null &&
              (varCheck as Record<string, unknown>)['var'] === 'environment' &&
              Array.isArray(aliases)
            ) {
              const envName = key.slice(2); // Remove 'is' prefix
              this.environmentAliases[envName.toLowerCase()] = aliases.map(String);
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

      this.flagsMap[flagKey] = displayFlag;
    }
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
    throw new Error('Not implemented');
  }

  /**
   * Get all flags from the internal state
   */
  getFlags(): DisplayFlag[] {
    return Object.values(this.flagsMap);
  }

  /**
   * Update a flag in the internal schema
   * @param flagKey - The flag to update
   * @param updatedFlag - The updated DisplayFlag
   * @param environments - Known environments for context
   */
  createOrUpdateFlag(flagKey: string, updatedFlag: DisplayFlag): void {
    throw new Error('Not implemented');
  }

  /**
   * Generate a FlagdSchema from the internal state
   */
  generateSchema(): FlagdSchema {
    // return schema;
    throw new Error('Not implemented');
  }
}
