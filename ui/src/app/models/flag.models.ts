export type FlagState = 'ENABLED' | 'DISABLED';
export type FlagType = 'boolean' | 'string' | 'number' | 'object';
export type ProjectSource = 'local' | 'remote';
export type MetadataMap = Record<string, string | number | boolean>;

export interface ProjectEntry {
  name: string;
  source: ProjectSource;
  backendUrl?: string;
}

export interface BackendInstance {
  id: string;
  url: string;
  label: string;
}

export interface FileGroup {
  label: string;
  icon: string;
  backendId?: string;
  entries: ProjectEntry[];
}

export interface FlagDefinition {
  state: FlagState;
  variants: Record<string, unknown>;
  defaultVariant?: string | null;
  targeting?: Record<string, unknown>;
  metadata?: MetadataMap;
}

export interface FlagEntry extends FlagDefinition {
  key: string;
}

export interface Environment {
  name: string;
  displayName: string;
  aliases: string[];
}

export interface Evaluator {
  [key: string]: unknown;
}

export interface FlagFileContent {
  $schema?: string;
  $evaluators?: Record<string, Evaluator>;
  flags: Record<string, FlagDefinition>;
  metadata?: MetadataMap;
}

export interface EnvironmentFlagState {
  environment: string;
  enabled: boolean;
  value?: unknown;
}

export function inferFlagType(variants: Record<string, unknown>): FlagType {
  const values = Object.values(variants);
  if (values.length === 0) return 'boolean';
  const first = values[0];
  if (typeof first === 'boolean') return 'boolean';
  if (typeof first === 'number') return 'number';
  if (typeof first === 'string') return 'string';
  return 'object';
}

export function getDefaultVariants(flagType: FlagType): { name: string; value: unknown }[] {
  switch (flagType) {
    case 'boolean':
      return [
        { name: 'on', value: true },
        { name: 'off', value: false },
      ];
    case 'string':
      return [
        { name: 'variant-a', value: '' },
        { name: 'variant-b', value: '' },
      ];
    case 'number':
      return [
        { name: 'variant-a', value: 0 },
        { name: 'variant-b', value: 0 },
      ];
    case 'object':
      return [{ name: 'variant-a', value: {} }];
  }
}

/**
 * Extracts environment definitions from $evaluators section
 */
export function extractEnvironments(evaluators?: Record<string, Evaluator>): Environment[] {
  if (!evaluators) return [];
  
  const environments: Environment[] = [];
  
  for (const [key, evaluator] of Object.entries(evaluators)) {
    // Check if this is an environment evaluator (pattern: "isXxx")
    if (key.startsWith('is') && typeof evaluator === 'object' && evaluator !== null) {
      const inOperator = (evaluator as any).in;
      if (Array.isArray(inOperator) && inOperator.length === 2) {
        const varCheck = inOperator[0];
        const aliases = inOperator[1];
        
        // Verify it's checking the "environment" variable
        if (
          typeof varCheck === 'object' &&
          varCheck !== null &&
          (varCheck as any).var === 'environment' &&
          Array.isArray(aliases)
        ) {
          const envName = key.slice(2); // Remove 'is' prefix
          const displayName = envName.charAt(0).toUpperCase() + envName.slice(1);
          environments.push({
            name: envName.toLowerCase(),
            displayName,
            aliases: aliases.map(String),
          });
        }
      }
    }
  }
  
  return environments;
}

/**
 * Creates an evaluator for an environment
 */
export function createEnvironmentEvaluator(aliases: string[]): Evaluator {
  return {
    in: [{ var: 'environment' }, aliases],
  };
}

/**
 * Generates targeting rules for environment-based flags
 */
export function generateEnvironmentTargeting(
  environments: Environment[],
  environmentStates: Record<string, boolean>,
  fallbackVariant: string = 'off'
): Record<string, unknown> {
  if (environments.length === 0) {
    return {};
  }

  // Build nested if-else structure
  const buildTargeting = (index: number): any => {
    if (index >= environments.length) {
      return fallbackVariant;
    }

    const env = environments[index];
    const isEnabled = environmentStates[env.name];
    const variantName = env.name.toLowerCase();

    return {
      if: [
        { $ref: `is${env.name.charAt(0).toUpperCase() + env.name.slice(1)}` },
        variantName,
        buildTargeting(index + 1),
      ],
    };
  };

  return buildTargeting(0);
}

/**
 * Generates variants for environment-based flags
 */
export function generateEnvironmentVariants(
  environments: Environment[],
  flagType: FlagType,
  environmentValues: Record<string, unknown>
): Record<string, unknown> {
  const variants: Record<string, unknown> = {};

  // Add environment-specific variants
  for (const env of environments) {
    const envName = env.name.toLowerCase();
    variants[envName] = environmentValues[envName] ?? getDefaultValueForType(flagType);
  }

  // Add fallback variant
  variants['off'] = getDefaultValueForType(flagType, false);

  return variants;
}

/**
 * Gets the default value for a flag type
 */
function getDefaultValueForType(flagType: FlagType, enabled: boolean = true): unknown {
  switch (flagType) {
    case 'boolean':
      return enabled;
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'object':
      return {};
  }
}

/**
 * Checks if a flag is using environment-based targeting
 */
export function isEnvironmentBasedFlag(
  flag: FlagDefinition,
  environments: Environment[]
): boolean {
  if (!flag.targeting || environments.length === 0) {
    return false;
  }

  // Check if variants include environment names
  const variantNames = Object.keys(flag.variants);
  const envNames = environments.map((e) => e.name.toLowerCase());
  
  return envNames.some((envName) => variantNames.includes(envName));
}

/**
 * Extracts environment states from a flag
 */
export function extractEnvironmentStates(
  flag: FlagDefinition,
  environments: Environment[],
  flagType: FlagType
): Record<string, unknown> {
  const states: Record<string, unknown> = {};

  for (const env of environments) {
    const envName = env.name.toLowerCase();
    const value = flag.variants[envName];
    
    if (value !== undefined) {
      states[envName] = value;
    } else {
      states[envName] = getDefaultValueForType(flagType);
    }
  }

  return states;
}
