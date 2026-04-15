import { InjectionToken } from '@angular/core';

// ============================================================================
// Canonical DTO types used across both backends
// ============================================================================

export interface CollectionDto {
  id: number;
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
  id: number;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
}

export interface GlobalTimeWindowDto {
  timeWindowId: number;
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
  timeWindowId?: number | null;
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

  // Collections
  listCollections(): Promise<CollectionDto[]>;
  createCollection(name: string): Promise<CollectionDto>;
  renameCollection(id: number, name: string): Promise<CollectionDto>;
  deleteCollection(id: number): Promise<void>;

  // Flags
  getFlags(collectionId: number): Promise<FlagDto[]>;
  createFlag(collectionId: number, flag: FlagDto): Promise<FlagDto>;
  updateFlag(collectionId: number, flag: FlagDto): Promise<FlagDto>; // TODO: Add originalKey parameter for key updates
  deleteFlag(collectionId: number, flagKey: string): Promise<void>;

  // Environments
  getEnvironments(collectionId: number): Promise<EnvironmentDto[]>;
  createEnvironment(collectionId: number, env: EnvironmentDto): Promise<EnvironmentDto>;
  updateEnvironment(collectionId: number, env: EnvironmentDto): Promise<EnvironmentDto>;
  deleteEnvironment(collectionId: number, name: string): Promise<void>;

  // Time windows
  getTimeWindows(collectionId: number): Promise<TimeWindowDto[]>;
  createTimeWindow(collectionId: number, tw: TimeWindowDto): Promise<TimeWindowDto>;
  updateTimeWindow(
    collectionId: number,
    timeWindowId: number,
    tw: TimeWindowDto,
  ): Promise<TimeWindowDto>;
  deleteTimeWindow(collectionId: number, timeWindowId: number): Promise<void>;

  // Schema
  exportSchema(collectionId: number): Promise<Record<string, unknown>>;
  importSchema(collectionId: number): Promise<void>;

  // Collection metadata
  updateCollectionMetadata(collectionId: number, metadata: MetadataDto[]): Promise<void>;
}

export const FLAG_BACKEND = new InjectionToken<FlagBackend>('FlagBackend');
