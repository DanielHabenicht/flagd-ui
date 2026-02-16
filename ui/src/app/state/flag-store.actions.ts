import { DisplayFlag, Environment } from '../models/abstraction/flagd-abstraction-models';

type FileSource = 'remote' | 'local-browser' | 'local-disk';

interface FlagFileContent {
  $schema?: string;
  $evaluators?: Record<string, unknown>;
  flags: Record<string, unknown>;
  metadata?: Record<string, string | number | boolean>;
}

export class LoadFlagsFiles {
  static readonly type = '[FlagStore] Load Flags-Files';
}

export class SelectFlagsFile {
  static readonly type = '[FlagStore] Select Flags-File';

  constructor(readonly fileId: string) {}
}

export class SelectFlagsFileByRoute {
  static readonly type = '[FlagStore] Select Flags-File By Route';

  constructor(
    readonly source: string,
    readonly name: string,
    readonly backendId?: string,
  ) {}
}

export class CreateFlagsFile {
  static readonly type = '[FlagStore] Create Flags-File';

  constructor(
    readonly name: string,
    readonly source: FileSource,
    readonly content?: FlagFileContent,
    readonly backendId?: string,
  ) {}
}

export class DeleteFlagsFile {
  static readonly type = '[FlagStore] Delete Flags-File';

  constructor(readonly fileId: string) {}
}

export class SaveFlag {
  static readonly type = '[FlagStore] Save Flag';

  constructor(keyOrFlag: string | DisplayFlag, flag?: DisplayFlag) {
    // Support both old and new signatures
    if (typeof keyOrFlag === 'string' && flag) {
      // Old signature: SaveFlag(key, flag)
      this.flag = { ...flag, key: keyOrFlag } as DisplayFlag;
    } else if (typeof keyOrFlag === 'object' && !flag) {
      // New signature: SaveFlag(flag)
      this.flag = keyOrFlag;
    } else {
      throw new Error('Invalid SaveFlag arguments');
    }
  }

  readonly flag: DisplayFlag;
}

export class DeleteFlag {
  static readonly type = '[FlagStore] Delete Flag';

  constructor(readonly key: string) {}
}

export class RenameFlag {
  static readonly type = '[FlagStore] Rename Flag';

  readonly oldKey: string;
  readonly flag: DisplayFlag;

  constructor(
    oldKeyOrFlag: string | DisplayFlag,
    flagOrNewKey?: DisplayFlag | string,
    maybeFlagDef?: DisplayFlag,
  ) {
    // Support both old and new signatures
    if (typeof oldKeyOrFlag === 'string' && typeof flagOrNewKey === 'string' && maybeFlagDef) {
      // Old signature: RenameFlag(oldKey, newKey, flag)
      this.oldKey = oldKeyOrFlag;
      this.flag = { ...maybeFlagDef, key: flagOrNewKey } as DisplayFlag;
    } else if (
      typeof oldKeyOrFlag === 'string' &&
      typeof flagOrNewKey === 'object' &&
      !maybeFlagDef
    ) {
      // New signature: RenameFlag(oldKey, flag)
      this.oldKey = oldKeyOrFlag;
      this.flag = flagOrNewKey;
    } else {
      throw new Error('Invalid RenameFlag arguments');
    }
  }
}

export class ImportLocalFlagsFile {
  static readonly type = '[FlagStore] Import Local Flags-File';

  constructor(
    readonly name: string,
    readonly content: FlagFileContent,
    readonly origin: 'browser' | 'disk' = 'browser',
  ) {}
}

export class SaveFlagsFileMetadata {
  static readonly type = '[FlagStore] Save Flags-File Metadata';

  constructor(readonly metadata: Record<string, string | number | boolean> | undefined) {}
}

export class UpdateEvaluators {
  static readonly type = '[FlagStore] Update Evaluators';

  constructor(readonly environments: Environment[]) {}
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
