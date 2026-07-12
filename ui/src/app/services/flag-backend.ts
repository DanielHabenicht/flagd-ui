// ============================================================================
// Canonical DTO types used across both backends
// ============================================================================

export interface CollectionDto {
  id: string;
  name: string;
  createdAt: string;
  metadata: MetadataDto[];
}

export interface FlagDto {
  key: string;
  type: string;
  state: string;
  booleanValue?: boolean | null;
  stringValue?: string | null;
  numberValue?: number | null;
  objectValue?: string | null;
  metadata?: MetadataDto[];
  perEnvironmentDefinitions?: Record<string, PerEnvironmentDefinitionDto>;
  globalTimeWindow?: GlobalTimeWindowDto;
  previousKey?: string | null;
}

export interface MetadataDto {
  key: string;
  stringValue?: string | null;
  numberValue?: number | null;
  booleanValue?: boolean | null;
}

export interface EnvironmentDto {
  name: string;
  aliases: string[];
}

export interface TimeWindowDto {
  id: string;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
}

export interface GlobalTimeWindowDto {
  timeWindowId: string;
  booleanValue?: boolean | null;
  stringValue?: string | null;
  numberValue?: number | null;
  objectValue?: string | null;
}

export interface PerEnvironmentDefinitionDto {
  booleanValue?: boolean | null;
  stringValue?: string | null;
  numberValue?: number | null;
  objectValue?: string | null;
  timeWindowId?: string | null;
}

// ============================================================================
// Backend interface
// ============================================================================

export interface FlagBackend {
  /**
   * Optional initialization (e.g. booting the WASM runtime).
   * Called once before any other method.
   */
  init?(): Promise<void>;

  /**
   * Optional saveState (e.g. persisting the current state).
   */
  saveState?(): Promise<void>;

  /**
   * Optional: export the raw SQLite database as bytes (WASM only).
   */
  exportDatabase?(): Promise<Uint8Array | null>;

  /**
   * Optional: purge the persisted database and reload (WASM only).
   */
  purgeDatabase?(): Promise<void>;

  // Collections
  listCollections(): Promise<CollectionDto[]>;
  createCollection(name: string): Promise<CollectionDto>;
  renameCollection(id: string, name: string): Promise<CollectionDto>;
  deleteCollection(id: string): Promise<void>;

  // Flags
  getFlags(collectionId: string): Promise<FlagDto[]>;
  createFlag(collectionId: string, flag: FlagDto): Promise<FlagDto>;
  updateFlag(collectionId: string, flag: FlagDto): Promise<FlagDto>; // TODO: Add originalKey parameter for key updates
  deleteFlag(collectionId: string, flagKey: string): Promise<void>;

  // Environments
  getEnvironments(collectionId: string): Promise<EnvironmentDto[]>;
  createEnvironment(collectionId: string, env: EnvironmentDto): Promise<EnvironmentDto>;
  updateEnvironment(collectionId: string, env: EnvironmentDto): Promise<EnvironmentDto>;
  deleteEnvironment(collectionId: string, name: string): Promise<void>;

  // Time windows
  getTimeWindows(collectionId: string): Promise<TimeWindowDto[]>;
  createTimeWindow(collectionId: string, tw: TimeWindowDto): Promise<TimeWindowDto>;
  updateTimeWindow(
    collectionId: string,
    timeWindowId: string,
    tw: TimeWindowDto,
  ): Promise<TimeWindowDto>;
  deleteTimeWindow(collectionId: string, timeWindowId: string): Promise<void>;

  // Schema
  exportSchema(collectionId: string): Promise<Record<string, unknown>>;
  importSchema(collectionId: string, schema: string): Promise<void>;

  // Collection metadata
  updateCollectionMetadata(collectionId: string, metadata: MetadataDto[]): Promise<void>;
}

export type BackendKind = 'wasm' | 'rest';

/** A selectable backend shown in the sidebar. */
export interface BackendServer {
  /** Route-safe key used as the `:uri` segment. */
  uri: string;
  name: string;
  kind: BackendKind;
  /** REST base URL (this server's origin or a remote URL); unused for wasm. */
  baseUrl: string;
}

export const IN_BROWSER_URI = 'browser';
export const THIS_SERVER_URI = 'server';
