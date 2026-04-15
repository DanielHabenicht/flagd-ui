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
    readonly id: number,
    readonly name: string,
  ) {}
}

export class DeleteCollection {
  static readonly type = '[FlagStore] Delete Collection';
  constructor(readonly id: number) {}
}

export class SelectCollection {
  static readonly type = '[FlagStore] Select Collection';
  constructor(readonly id: number | null) {}
}

// ============================================================================
// Flag actions
// ============================================================================

export class LoadFlags {
  static readonly type = '[FlagStore] Load Flags';
  constructor(readonly collectionId: number) {}
}

export class CreateFlag {
  static readonly type = '[FlagStore] Create Flag';
  constructor(
    readonly collectionId: number,
    readonly flag: FlagDto,
  ) {}
}

export class UpdateFlag {
  static readonly type = '[FlagStore] Update Flag';
  constructor(
    readonly collectionId: number,
    readonly flag: FlagDto,
    readonly originalKey?: string,
  ) {}
}

export class DeleteFlag {
  static readonly type = '[FlagStore] Delete Flag';
  constructor(
    readonly collectionId: number,
    readonly flagKey: string,
  ) {}
}

// ============================================================================
// Environment actions
// ============================================================================

export class LoadEnvironments {
  static readonly type = '[FlagStore] Load Environments';
  constructor(readonly collectionId: number) {}
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
  constructor(readonly collectionId: number) {}
}

export class CreateTimeWindow {
  static readonly type = '[FlagStore] Create Time Window';
  constructor(
    readonly collectionId: number,
    readonly timeWindow: TimeWindowDto,
  ) {}
}

export class UpdateTimeWindow {
  static readonly type = '[FlagStore] Update Time Window';
  constructor(
    readonly collectionId: number,
    readonly timeWindowId: number,
    readonly timeWindow: TimeWindowDto,
  ) {}
}

export class DeleteTimeWindow {
  static readonly type = '[FlagStore] Delete Time Window';
  constructor(
    readonly collectionId: number,
    readonly timeWindowId: number,
  ) {}
}

// ============================================================================
// Schema actions
// ============================================================================

export class ExportSchema {
  static readonly type = '[FlagStore] Export Schema';
  constructor(readonly collectionId: number) {}
}

export class ImportSchema {
  static readonly type = '[FlagStore] Import Schema';
  constructor(readonly collectionId: number) {}
}

export class SaveDatabase {
  static readonly type = '[FlagStore] Save Database';
}

// ============================================================================
// Collection metadata actions
// ============================================================================

export class SetCollectionMetadata {
  static readonly type = '[FlagStore] Set Collection Metadata';
  constructor(
    readonly collectionId: number,
    readonly metadata: MetadataDto[],
  ) {}
}
