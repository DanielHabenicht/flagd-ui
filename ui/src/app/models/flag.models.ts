export type FlagState = 'ENABLED' | 'DISABLED';
export type FlagType = 'boolean' | 'string' | 'number' | 'object';
export type FlagsFileSource = 'local' | 'remote';
export type LocalFlagsFileOrigin = 'browser' | 'disk';
export type MetadataMap = Record<string, string | number | boolean>;

export interface FlagDefinition {
  state: FlagState;
  variants: Record<string, unknown>;
  defaultVariant?: string | null;
  targeting?: Record<string, unknown>;
  metadata?: MetadataMap;
}

export type Evaluator = Record<string, unknown>;

export interface FlagFileContent {
  $schema?: string;
  $evaluators?: Record<string, Evaluator>;
  flags: Record<string, FlagDefinition>;
  metadata?: MetadataMap;
}
