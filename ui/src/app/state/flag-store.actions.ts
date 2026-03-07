import { FlagEntryDto } from '../api-client/model/flagEntryDto';
import { EnvironmentEntryDto } from '../api-client/model/environmentEntryDto';
import { TimeWindowDto } from '../api-client/model/timeWindowDto';
import { MetadataEntryDto } from '../api-client/model/metadataEntryDto';
import { RenameCollectionIdParameter } from '../api-client/model/renameCollectionIdParameter';

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
    readonly id: RenameCollectionIdParameter,
    readonly name: string,
  ) {}
}

export class DeleteCollection {
  static readonly type = '[FlagStore] Delete Collection';
  constructor(readonly id: RenameCollectionIdParameter) {}
}

export class SelectCollection {
  static readonly type = '[FlagStore] Select Collection';
  constructor(readonly id: RenameCollectionIdParameter | null) {}
}

// ============================================================================
// Flag actions
// ============================================================================

export class LoadFlags {
  static readonly type = '[FlagStore] Load Flags';
  constructor(readonly collectionId: RenameCollectionIdParameter) {}
}

export class CreateFlag {
  static readonly type = '[FlagStore] Create Flag';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly flag: FlagEntryDto,
  ) {}
}

export class UpdateFlag {
  static readonly type = '[FlagStore] Update Flag';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly flag: FlagEntryDto,
  ) {}
}

export class DeleteFlag {
  static readonly type = '[FlagStore] Delete Flag';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly flagKey: string,
  ) {}
}

// ============================================================================
// Environment actions
// ============================================================================

export class LoadEnvironments {
  static readonly type = '[FlagStore] Load Environments';
  constructor(readonly collectionId: RenameCollectionIdParameter) {}
}

export class CreateEnvironment {
  static readonly type = '[FlagStore] Create Environment';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly environment: EnvironmentEntryDto,
  ) {}
}

export class UpdateEnvironment {
  static readonly type = '[FlagStore] Update Environment';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly environment: EnvironmentEntryDto,
  ) {}
}

export class DeleteEnvironment {
  static readonly type = '[FlagStore] Delete Environment';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly name: string,
  ) {}
}

// ============================================================================
// Time window actions
// ============================================================================

export class LoadTimeWindows {
  static readonly type = '[FlagStore] Load Time Windows';
  constructor(readonly collectionId: RenameCollectionIdParameter) {}
}

export class CreateTimeWindow {
  static readonly type = '[FlagStore] Create Time Window';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly timeWindow: TimeWindowDto,
  ) {}
}

export class UpdateTimeWindow {
  static readonly type = '[FlagStore] Update Time Window';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly timeWindowId: RenameCollectionIdParameter,
    readonly timeWindow: TimeWindowDto,
  ) {}
}

export class DeleteTimeWindow {
  static readonly type = '[FlagStore] Delete Time Window';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly timeWindowId: RenameCollectionIdParameter,
  ) {}
}

// ============================================================================
// Schema actions
// ============================================================================

export class ExportSchema {
  static readonly type = '[FlagStore] Export Schema';
  constructor(readonly collectionId: RenameCollectionIdParameter) {}
}

export class ImportSchema {
  static readonly type = '[FlagStore] Import Schema';
  constructor(readonly collectionId: RenameCollectionIdParameter) {}
}

// ============================================================================
// Collection metadata actions
// ============================================================================

export class SetCollectionMetadata {
  static readonly type = '[FlagStore] Set Collection Metadata';
  constructor(
    readonly collectionId: RenameCollectionIdParameter,
    readonly metadata: MetadataEntryDto[],
  ) {}
}
