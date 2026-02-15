import { computed, inject, Injectable } from '@angular/core';
import { Store } from '@ngxs/store';
import {
  FlagDefinition,
  FlagEntry,
  FlagsFileEntry,
  FlagFileContent,
  MetadataMap,
  Evaluator,
  FileGroup,
  Environment,
  LocalFlagsFileOrigin,
} from '../models/flag.models';
import {
  CreateLocalFlagsFile,
  CreateRemoteFlagsFile,
  DeleteFlag,
  DeleteFlagsFile,
  ImportLocalFlagsFile,
  LoadFlagsFiles,
  RenameFlag,
  SaveFlag,
  SaveFlagsFileMetadata,
  SelectFlagsFile,
  SelectFlagsFileByRoute,
  SetHasDefaultBackend,
  UpdateEvaluators,
} from '../state/flag-store.actions';
import { FlagStoreState } from '../state/flag-store.state';

@Injectable({ providedIn: 'root' })
export class FlagStore {
  private readonly ngxsStore = inject(Store);

  readonly flagsFiles = this.ngxsStore.selectSignal(FlagStoreState.flagsFiles);
  readonly currentFlagsFile = this.ngxsStore.selectSignal(FlagStoreState.currentFlagsFile);
  readonly currentFlags = this.ngxsStore.selectSignal(FlagStoreState.currentFlags);
  readonly currentEvaluators = this.ngxsStore.selectSignal(FlagStoreState.currentEvaluators);
  readonly currentMetadata = this.ngxsStore.selectSignal(FlagStoreState.currentMetadata);
  readonly loading = this.ngxsStore.selectSignal(FlagStoreState.loading);
  readonly error = this.ngxsStore.selectSignal(FlagStoreState.error);
  readonly hasDefaultBackend = this.ngxsStore.selectSignal(FlagStoreState.hasDefaultBackend);
  readonly currentEnvironments = this.ngxsStore.selectSignal(FlagStoreState.currentEnvironments);
  readonly flagEntries = this.ngxsStore.selectSignal(FlagStoreState.flagEntries);
  readonly fileGroups = this.ngxsStore.selectSignal(FlagStoreState.fileGroups);

  readonly currentFlagsFileName = computed(() => this.currentFlagsFile()?.name ?? null);

  loadFlagsFiles(): void {
    this.ngxsStore.dispatch(new LoadFlagsFiles());
  }

  selectFlagsFile(entry: FlagsFileEntry): void {
    this.ngxsStore.dispatch(new SelectFlagsFile(entry));
  }

  selectFlagsFileByRoute(source: string, name: string, backendId?: string): void {
    this.ngxsStore.dispatch(new SelectFlagsFileByRoute(source, name, backendId));
  }

  createLocalFlagsFile(name: string): void {
    this.ngxsStore.dispatch(new CreateLocalFlagsFile(name));
  }

  createRemoteFlagsFile(backendUrl: string, name: string): void {
    this.ngxsStore.dispatch(new CreateRemoteFlagsFile(backendUrl, name));
  }

  deleteFlagsFile(entry: FlagsFileEntry): void {
    this.ngxsStore.dispatch(new DeleteFlagsFile(entry));
  }

  saveFlag(key: string, flag: FlagDefinition): void {
    this.ngxsStore.dispatch(new SaveFlag(key, flag));
  }

  deleteFlag(key: string): void {
    this.ngxsStore.dispatch(new DeleteFlag(key));
  }

  renameFlag(oldKey: string, newKey: string, flag: FlagDefinition): void {
    this.ngxsStore.dispatch(new RenameFlag(oldKey, newKey, flag));
  }

  importLocalFlagsFile(
    name: string,
    content: FlagFileContent,
    origin: LocalFlagsFileOrigin = 'browser',
  ): void {
    this.ngxsStore.dispatch(new ImportLocalFlagsFile(name, content, origin));
  }

  saveFlagsFileMetadata(metadata: MetadataMap | undefined): void {
    this.ngxsStore.dispatch(new SaveFlagsFileMetadata(metadata));
  }

  downloadCurrentFlagsFile(): void {
    const flagsFile = this.currentFlagsFile();
    const flags = this.currentFlags();
    if (!flagsFile || !flags) return;

    const content: FlagFileContent = {
      ...this.buildFlagsFileContent(flags, this.currentMetadata()),
    };

    const blob = new Blob([JSON.stringify(content, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flagsFile.name}.flagd.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildFlagsFileContent(
    flags: Record<string, FlagDefinition>,
    metadata: MetadataMap | undefined,
  ): FlagFileContent {
    const content: FlagFileContent = {
      $schema: 'https://flagd.dev/schema/v0/flags.json',
      flags,
    };

    // Preserve evaluators
    const evaluators = this.currentEvaluators();
    if (evaluators && Object.keys(evaluators).length > 0) {
      content.$evaluators = evaluators;
    }

    if (metadata && Object.keys(metadata).length > 0) {
      content.metadata = metadata;
    }

    return content;
  }

  /** Update evaluators for the current flags-file */
  updateEvaluators(evaluators: Record<string, Evaluator> | undefined): void {
    this.ngxsStore.dispatch(new UpdateEvaluators(evaluators));
  }

  setHasDefaultBackend(available: boolean): void {
    this.ngxsStore.dispatch(new SetHasDefaultBackend(available));
  }
}
