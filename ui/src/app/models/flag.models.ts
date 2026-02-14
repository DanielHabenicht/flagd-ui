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

export interface FlagFileContent {
  $schema?: string;
  flags: Record<string, FlagDefinition>;
  metadata?: MetadataMap;
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
