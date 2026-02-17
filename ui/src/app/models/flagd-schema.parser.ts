import Ajv, { ValidateFunction } from 'ajv';
import { FlagdSchema } from './generated/flagd-schema';
import flagdSchema from '../../../../schema/flagd-schema.json';
import targetingSchema from '../../../../schema/targeting.json';

// Initialize AJV validator with strictRef disabled to allow unresolved references
const ajv = new Ajv();

// Add the targeting schema as a reference (using local file identifier instead of external URL)
ajv.addSchema(targetingSchema, 'targeting.json');

let validateFlagdSchema: ValidateFunction;

/**
 * Initializes the schema validator (called once on first use)
 */
function initializeValidator(): void {
  if (!validateFlagdSchema) {
    validateFlagdSchema = ajv.compile(flagdSchema);
  }
}

/**
 * Parses a JSON string into a FlagdSchema object and validates it
 * @param jsonString - The JSON string to parse
 * @returns The parsed and validated object typed as FlagdSchema
 * @throws Error if the JSON is invalid or doesn't conform to the FlagdSchema
 */
export function parseFlagdSchema(jsonString: string): FlagdSchema {
  const parsed = JSON.parse(jsonString);
  validateSchema(parsed);
  return parsed as FlagdSchema;
}

/**
 * Converts a FlagdSchema object to a JSON string after validation
 * @param schema - The FlagdSchema object to stringify
 * @param space - Optional formatting (e.g., 2 for pretty printing)
 * @returns The JSON string representation
 * @throws Error if the schema doesn't conform to FlagdSchema validation
 */
export function stringifyFlagdSchema(schema: FlagdSchema, space?: number | string): string {
  validateSchema(schema);
  return JSON.stringify(schema, null, space);
}

/**
 * Validates an object against the FlagdSchema
 * @param data - The data to validate
 * @throws Error with validation details if the data is invalid
 */
export function validateSchema(data: unknown): void {
  initializeValidator();

  const isValid = validateFlagdSchema(data);
  if (!isValid) {
    const errors = validateFlagdSchema.errors || [];
    const errorMessages = errors
      .map((err) => `${err.instancePath || '$'}: ${err.message}`)
      .join('; ');
    throw new Error(`Schema validation failed: ${errorMessages}`);
  }
}
