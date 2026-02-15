import {
  Evaluator,
  FlagsFileEntry,
  FlagDefinition,
  FlagFileContent,
  LocalFlagsFileOrigin,
  MetadataMap,
} from '../models/flag.models';

export class LoadFlagsFiles {
  static readonly type = '[FlagStore] Load Flags-Files';
}

export class SelectFlagsFile {
  static readonly type = '[FlagStore] Select Flags-File';

  constructor(readonly entry: FlagsFileEntry) {}
}

export class SelectFlagsFileByRoute {
  static readonly type = '[FlagStore] Select Flags-File By Route';

  constructor(
    readonly source: string,
    readonly name: string,
    readonly backendId?: string,
  ) {}
}

export class CreateLocalFlagsFile {
  static readonly type = '[FlagStore] Create Local Flags-File';

  constructor(readonly name: string) {}
}

export class CreateRemoteFlagsFile {
  static readonly type = '[FlagStore] Create Remote Flags-File';

  constructor(
    readonly backendUrl: string,
    readonly name: string,
  ) {}
}

export class DeleteFlagsFile {
  static readonly type = '[FlagStore] Delete Flags-File';

  constructor(readonly entry: FlagsFileEntry) {}
}

export class SaveFlag {
  static readonly type = '[FlagStore] Save Flag';

  constructor(
    readonly key: string,
    readonly flag: FlagDefinition,
  ) {}
}

export class DeleteFlag {
  static readonly type = '[FlagStore] Delete Flag';

  constructor(readonly key: string) {}
}

export class RenameFlag {
  static readonly type = '[FlagStore] Rename Flag';

  constructor(
    readonly oldKey: string,
    readonly newKey: string,
    readonly flag: FlagDefinition,
  ) {}
}

export class ImportLocalFlagsFile {
  static readonly type = '[FlagStore] Import Local Flags-File';

  constructor(
    readonly name: string,
    readonly content: FlagFileContent,
    readonly origin: LocalFlagsFileOrigin = 'browser',
  ) {}
}

export class SaveFlagsFileMetadata {
  static readonly type = '[FlagStore] Save Flags-File Metadata';

  constructor(readonly metadata: MetadataMap | undefined) {}
}

export class UpdateEvaluators {
  static readonly type = '[FlagStore] Update Evaluators';

  constructor(readonly evaluators: Record<string, Evaluator> | undefined) {}
}

export class SetHasDefaultBackend {
  static readonly type = '[FlagStore] Set Has Default Backend';

  constructor(readonly hasDefaultBackend: boolean) {}
}

export class AddBackend {
  static readonly type = '[FlagStore] Add Backend';

  constructor(
    readonly url: string,
    readonly label?: string,
  ) {}
}

export class RemoveBackend {
  static readonly type = '[FlagStore] Remove Backend';

  constructor(readonly id: string) {}
}

export class SaveLocalFlagsFileContent {
  static readonly type = '[FlagStore] Save Local Flags-File Content';

  constructor(
    readonly name: string,
    readonly content: FlagFileContent,
  ) {}
}

export class CreateLocalFlagsFileEntry {
  static readonly type = '[FlagStore] Create Local Flags-File Entry';

  constructor(readonly name: string) {}
}

export class DeleteLocalFlagsFileEntry {
  static readonly type = '[FlagStore] Delete Local Flags-File Entry';

  constructor(readonly name: string) {}
}
