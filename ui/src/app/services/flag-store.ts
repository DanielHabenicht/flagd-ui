import { computed, inject, Injectable } from '@angular/core';
import { Store } from '@ngxs/store';
import {
  FlagDefinition,
  FlagEntry,
  FlagFileContent,
  MetadataMap,
  ProjectEntry,
  Evaluator,
  FileGroup,
  Environment,
} from '../models/flag.models';
import {
  CreateLocalProject,
  CreateRemoteProject,
  DeleteFlag,
  DeleteProject,
  ImportLocalProject,
  LoadProjects,
  RenameFlag,
  SaveFlag,
  SaveProjectMetadata,
  SelectProject,
  SelectProjectByRoute,
  SetHasDefaultBackend,
  UpdateEvaluators,
} from '../state/flag-store.actions';
import { FlagStoreState } from '../state/flag-store.state';

@Injectable({ providedIn: 'root' })
export class FlagStore {
  private readonly ngxsStore = inject(Store);

  readonly projects = this.ngxsStore.selectSignal(FlagStoreState.projects);
  readonly currentProject = this.ngxsStore.selectSignal(FlagStoreState.currentProject);
  readonly currentFlags = this.ngxsStore.selectSignal(FlagStoreState.currentFlags);
  readonly currentEvaluators = this.ngxsStore.selectSignal(FlagStoreState.currentEvaluators);
  readonly currentMetadata = this.ngxsStore.selectSignal(FlagStoreState.currentMetadata);
  readonly loading = this.ngxsStore.selectSignal(FlagStoreState.loading);
  readonly error = this.ngxsStore.selectSignal(FlagStoreState.error);
  readonly hasDefaultBackend = this.ngxsStore.selectSignal(FlagStoreState.hasDefaultBackend);
  readonly currentEnvironments = this.ngxsStore.selectSignal(FlagStoreState.currentEnvironments);
  readonly flagEntries = this.ngxsStore.selectSignal(FlagStoreState.flagEntries);
  readonly fileGroups = this.ngxsStore.selectSignal(FlagStoreState.fileGroups);

  readonly currentProjectName = computed(() => this.currentProject()?.name ?? null);

  loadProjects(): void {
    this.ngxsStore.dispatch(new LoadProjects());
  }

  selectProject(entry: ProjectEntry): void {
    this.ngxsStore.dispatch(new SelectProject(entry));
  }

  /** Find a ProjectEntry by source parameters and select it */
  selectProjectByRoute(source: string, name: string, backendId?: string): void {
    this.ngxsStore.dispatch(new SelectProjectByRoute(source, name, backendId));
  }

  createLocalProject(name: string): void {
    this.ngxsStore.dispatch(new CreateLocalProject(name));
  }

  createRemoteProject(backendUrl: string, name: string): void {
    this.ngxsStore.dispatch(new CreateRemoteProject(backendUrl, name));
  }

  deleteProject(entry: ProjectEntry): void {
    this.ngxsStore.dispatch(new DeleteProject(entry));
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

  importLocalProject(name: string, content: FlagFileContent): void {
    this.ngxsStore.dispatch(new ImportLocalProject(name, content));
  }

  saveProjectMetadata(metadata: MetadataMap | undefined): void {
    this.ngxsStore.dispatch(new SaveProjectMetadata(metadata));
  }

  downloadCurrentProject(): void {
    const project = this.currentProject();
    const flags = this.currentFlags();
    if (!project || !flags) return;

    const content: FlagFileContent = {
      ...this.buildProjectContent(flags, this.currentMetadata()),
    };

    const blob = new Blob([JSON.stringify(content, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.flagd.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildProjectContent(
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

  /** Update evaluators for the current project */
  updateEvaluators(evaluators: Record<string, Evaluator> | undefined): void {
    this.ngxsStore.dispatch(new UpdateEvaluators(evaluators));
  }

  setHasDefaultBackend(available: boolean): void {
    this.ngxsStore.dispatch(new SetHasDefaultBackend(available));
  }
}
