import {
  // CollectionDto,
  EnvironmentDto,
  FlagDto,
  MetadataDto,
  TimeWindowDto,
} from '../services/flag-backend';

// ============================================================================
// Collection actions
// ============================================================================

export class LoadCollections {
  static readonly type = '[FlagStore] Load Collections';
}

export class CreateCollection {
  static readonly type = '[FlagStore] Create Collection';
  constructor(readonly name: string) {}
}

export class RenameCollection {
  static readonly type = '[FlagStore] Rename Collection';
  constructor(
    readonly id: string,
    readonly name: string,
  ) {}
}

export class DeleteCollection {
  static readonly type = '[FlagStore] Delete Collection';
  constructor(readonly id: string) {}
}

export class SelectCollection {
  static readonly type = '[FlagStore] Select Collection';
  constructor(readonly id: string | undefined) {}
}

// ============================================================================
// Flag actions
// ============================================================================

export class LoadFlags {
  static readonly type = '[FlagStore] Load Flags';
  constructor(readonly collectionId: string) {}
}

export class CreateFlag {
  static readonly type = '[FlagStore] Create Flag';
  constructor(
    readonly collectionId: string,
    readonly flag: FlagDto,
  ) {}
}

export class UpdateFlag {
  static readonly type = '[FlagStore] Update Flag';
  constructor(
    readonly collectionId: string,
    readonly flag: FlagDto,
    readonly originalKey?: string,
  ) {}
}

export class DeleteFlag {
  static readonly type = '[FlagStore] Delete Flag';
  constructor(
    readonly collectionId: string,
    readonly flagKey: string,
  ) {}
}

// ============================================================================
// Environment actions
// ============================================================================

export class LoadEnvironments {
  static readonly type = '[FlagStore] Load Environments';
  constructor(readonly collectionId: string) {}
}

export class CreateEnvironment {
  static readonly type = '[FlagStore] Create Environment';
  constructor(readonly environment: EnvironmentDto) {}
}

export class UpdateEnvironment {
  static readonly type = '[FlagStore] Update Environment';
  constructor(
    readonly previousName: string,
    readonly environment: EnvironmentDto,
  ) {}
}

export class DeleteEnvironment {
  static readonly type = '[FlagStore] Delete Environment';
  constructor(readonly name: string) {}
}

// ============================================================================
// Time window actions
// ============================================================================

export class LoadTimeWindows {
  static readonly type = '[FlagStore] Load Time Windows';
  constructor(readonly collectionId: string) {}
}

export class CreateTimeWindow {
  static readonly type = '[FlagStore] Create Time Window';
  constructor(
    readonly collectionId: string,
    readonly timeWindow: TimeWindowDto,
  ) {}
}

export class UpdateTimeWindow {
  static readonly type = '[FlagStore] Update Time Window';
  constructor(
    readonly collectionId: string,
    readonly timeWindowId: string,
    readonly timeWindow: TimeWindowDto,
  ) {}
}

export class DeleteTimeWindow {
  static readonly type = '[FlagStore] Delete Time Window';
  constructor(
    readonly collectionId: string,
    readonly timeWindowId: string,
  ) {}
}

// ============================================================================
// Schema actions
// ============================================================================

export class ExportSchema {
  static readonly type = '[FlagStore] Export Schema';
  constructor(readonly collectionId: string) {}
}

export class ImportSchema {
  static readonly type = '[FlagStore] Import Schema';
  constructor(
    readonly newCollectionName: string,
    readonly schema: string,
  ) {}
}

export class SaveDatabase {
  static readonly type = '[FlagStore] Save Database';
}

// ============================================================================
// Server actions
// ============================================================================

export class CreateServer {
  static readonly type = '[FlagStore] Create Server';
  constructor(
    readonly name: string,
    readonly url: string,
  ) {}
}

export class SelectServer {
  static readonly type = '[FlagStore] Select Server';
  constructor(readonly uri: string | null) {}
}

// ============================================================================
// Collection metadata actions
// ============================================================================

export class SetCollectionMetadata {
  static readonly type = '[FlagStore] Set Collection Metadata';
  constructor(
    readonly collectionId: string,
    readonly metadata: MetadataDto[],
  ) {}
}
