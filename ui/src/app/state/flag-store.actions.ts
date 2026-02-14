import {
  Evaluator,
  FlagDefinition,
  FlagFileContent,
  MetadataMap,
  ProjectEntry,
} from '../models/flag.models';

export class LoadProjects {
  static readonly type = '[FlagStore] Load Projects';
}

export class SelectProject {
  static readonly type = '[FlagStore] Select Project';

  constructor(readonly entry: ProjectEntry) {}
}

export class SelectProjectByRoute {
  static readonly type = '[FlagStore] Select Project By Route';

  constructor(
    readonly source: string,
    readonly name: string,
    readonly backendId?: string,
  ) {}
}

export class CreateLocalProject {
  static readonly type = '[FlagStore] Create Local Project';

  constructor(readonly name: string) {}
}

export class CreateRemoteProject {
  static readonly type = '[FlagStore] Create Remote Project';

  constructor(
    readonly backendUrl: string,
    readonly name: string,
  ) {}
}

export class DeleteProject {
  static readonly type = '[FlagStore] Delete Project';

  constructor(readonly entry: ProjectEntry) {}
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

export class ImportLocalProject {
  static readonly type = '[FlagStore] Import Local Project';

  constructor(
    readonly name: string,
    readonly content: FlagFileContent,
  ) {}
}

export class SaveProjectMetadata {
  static readonly type = '[FlagStore] Save Project Metadata';

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

export class SaveLocalProjectContent {
  static readonly type = '[FlagStore] Save Local Project Content';

  constructor(
    readonly name: string,
    readonly content: FlagFileContent,
  ) {}
}

export class CreateLocalProjectEntry {
  static readonly type = '[FlagStore] Create Local Project Entry';

  constructor(readonly name: string) {}
}

export class DeleteLocalProjectEntry {
  static readonly type = '[FlagStore] Delete Local Project Entry';

  constructor(readonly name: string) {}
}