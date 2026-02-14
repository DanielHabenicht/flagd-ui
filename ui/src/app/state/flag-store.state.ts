import { inject, Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { Router } from '@angular/router';
import { catchError, forkJoin, Observable, of, switchMap, tap } from 'rxjs';
import {
  BackendInstance,
  Environment,
  Evaluator,
  extractEnvironments,
  FlagDefinition,
  FlagEntry,
  FlagFileContent,
  FileGroup,
  MetadataMap,
  ProjectEntry,
} from '../models/flag.models';
import { RemoteApi } from '../services/remote-api';
import {
  AddBackend,
  CreateLocalProject,
  CreateLocalProjectEntry,
  CreateRemoteProject,
  DeleteFlag,
  DeleteLocalProjectEntry,
  DeleteProject,
  ImportLocalProject,
  LoadProjects,
  RemoveBackend,
  RenameFlag,
  SaveFlag,
  SaveLocalProjectContent,
  SaveProjectMetadata,
  SelectProject,
  SelectProjectByRoute,
  SetHasDefaultBackend,
  UpdateEvaluators,
} from './flag-store.actions';

export interface FlagStoreStateModel {
  projects: ProjectEntry[];
  currentProject: ProjectEntry | null;
  currentFlags: Record<string, FlagDefinition> | null;
  currentEvaluators: Record<string, Evaluator> | undefined;
  currentMetadata: MetadataMap | undefined;
  loading: boolean;
  error: string | null;
  hasDefaultBackend: boolean;
  localProjects: Record<string, FlagFileContent>;
  backends: BackendInstance[];
}

@State<FlagStoreStateModel>({
  name: 'flagStore',
  defaults: {
    projects: [],
    currentProject: null,
    currentFlags: null,
    currentEvaluators: undefined,
    currentMetadata: undefined,
    loading: false,
    error: null,
    hasDefaultBackend: false,
    localProjects: {},
    backends: [],
  },
})
@Injectable()
export class FlagStoreState {
  private readonly remoteApi = inject(RemoteApi);
  private readonly router = inject(Router);

  @Selector()
  static projects(state: FlagStoreStateModel): ProjectEntry[] {
    return state.projects;
  }

  @Selector()
  static currentProject(state: FlagStoreStateModel): ProjectEntry | null {
    return state.currentProject;
  }

  @Selector()
  static currentFlags(state: FlagStoreStateModel): Record<string, FlagDefinition> | null {
    return state.currentFlags;
  }

  @Selector()
  static currentEvaluators(state: FlagStoreStateModel): Record<string, Evaluator> | undefined {
    return state.currentEvaluators;
  }

  @Selector()
  static currentMetadata(state: FlagStoreStateModel): MetadataMap | undefined {
    return state.currentMetadata;
  }

  @Selector()
  static loading(state: FlagStoreStateModel): boolean {
    return state.loading;
  }

  @Selector()
  static error(state: FlagStoreStateModel): string | null {
    return state.error;
  }

  @Selector()
  static hasDefaultBackend(state: FlagStoreStateModel): boolean {
    return state.hasDefaultBackend;
  }

  @Selector()
  static backends(state: FlagStoreStateModel): BackendInstance[] {
    return state.backends;
  }

  @Selector()
  static currentEnvironments(state: FlagStoreStateModel): Environment[] {
    return extractEnvironments(state.currentEvaluators);
  }

  @Selector()
  static flagEntries(state: FlagStoreStateModel): FlagEntry[] {
    if (!state.currentFlags) return [];
    return Object.entries(state.currentFlags).map(([key, def]) => ({ key, ...def }));
  }

  @Selector()
  static fileGroups(state: FlagStoreStateModel): FileGroup[] {
    const groups: FileGroup[] = [];

    for (const backend of state.backends) {
      const entries = state.projects.filter(
        (project) => project.source === 'remote' && project.backendUrl === backend.url,
      );
      if (entries.length > 0) {
        groups.push({
          label: backend.label,
          icon: 'cloud',
          backendId: backend.id,
          entries,
        });
      }
    }

    const localEntries = state.projects.filter((project) => project.source === 'local');
    if (localEntries.length > 0) {
      groups.push({ label: 'Local Files', icon: 'computer', entries: localEntries });
    }

    return groups;
  }

  @Selector()
  static localProjects(state: FlagStoreStateModel): Record<string, FlagFileContent> {
    return state.localProjects;
  }

  @Action(SetHasDefaultBackend)
  setHasDefaultBackend(ctx: StateContext<FlagStoreStateModel>, action: SetHasDefaultBackend): void {
    ctx.patchState({ hasDefaultBackend: action.hasDefaultBackend });
  }

  @Action(AddBackend)
  addBackend(ctx: StateContext<FlagStoreStateModel>, action: AddBackend): void {
    const state = ctx.getState();
    const normalized = this.normalizeBackendUrl(action.url);
    const existing = state.backends.find((backend) => backend.url === normalized);
    if (existing) return;

    const instance: BackendInstance = {
      id: crypto.randomUUID().slice(0, 8),
      url: normalized,
      label: action.label || this.inferBackendLabel(normalized),
    };

    ctx.patchState({ backends: [...state.backends, instance] });
  }

  @Action(RemoveBackend)
  removeBackend(ctx: StateContext<FlagStoreStateModel>, action: RemoveBackend): void {
    const state = ctx.getState();
    ctx.patchState({
      backends: state.backends.filter((backend) => backend.id !== action.id),
    });
  }

  @Action(SaveLocalProjectContent)
  saveLocalProjectContent(
    ctx: StateContext<FlagStoreStateModel>,
    action: SaveLocalProjectContent,
  ): void {
    const state = ctx.getState();
    ctx.patchState({
      localProjects: {
        ...state.localProjects,
        [action.name]: action.content,
      },
    });
  }

  @Action(CreateLocalProjectEntry)
  createLocalProjectEntry(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateLocalProjectEntry,
  ): void {
    const state = ctx.getState();
    if (state.localProjects[action.name]) {
      throw new Error(`Project "${action.name}" already exists`);
    }

    ctx.patchState({
      localProjects: {
        ...state.localProjects,
        [action.name]: { flags: {} },
      },
    });
  }

  @Action(DeleteLocalProjectEntry)
  deleteLocalProjectEntry(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteLocalProjectEntry,
  ): void {
    const state = ctx.getState();
    const existing = state.localProjects[action.name];
    if (!existing) {
      throw new Error(`Project "${action.name}" not found`);
    }

    const nextLocalProjects = { ...state.localProjects };
    delete nextLocalProjects[action.name];
    ctx.patchState({ localProjects: nextLocalProjects });
  }

  @Action(LoadProjects)
  loadProjects(ctx: StateContext<FlagStoreStateModel>): Observable<unknown> | void {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    const localEntries: ProjectEntry[] = Object.keys(state.localProjects)
      .sort()
      .map((name) => ({ name, source: 'local' as const }));

    if (state.backends.length === 0) {
      ctx.patchState({ projects: localEntries, loading: false });
      return;
    }

    const remoteRequests = state.backends.map((backend) =>
      this.remoteApi.listProjects(backend.url).pipe(
        catchError((err) => {
          console.error(`Failed to load projects from ${backend.url}`, err);
          return of([] as string[]);
        }),
      ),
    );

    return forkJoin(remoteRequests).pipe(
      tap((results) => {
        const remoteEntries: ProjectEntry[] = [];
        results.forEach((names, index) => {
          const backend = state.backends[index];
          names.forEach((name) => {
            remoteEntries.push({
              name,
              source: 'remote',
              backendUrl: backend.url,
            });
          });
        });

        ctx.patchState({
          projects: [...localEntries, ...remoteEntries],
          loading: false,
        });
      }),
      catchError((err) => {
        ctx.patchState({
          projects: localEntries,
          error: 'Failed to load remote projects',
          loading: false,
        });
        console.error('Failed to load remote projects', err);
        return of(void 0);
      }),
    );
  }

  @Action(SelectProject)
  selectProject(
    ctx: StateContext<FlagStoreStateModel>,
    action: SelectProject,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    const current = state.currentProject;

    const isSameProject =
      current?.name === action.entry.name &&
      current?.source === action.entry.source &&
      (current?.backendUrl ?? '') === (action.entry.backendUrl ?? '');

    if (isSameProject && (state.loading || state.currentFlags !== null)) {
      return;
    }

    ctx.patchState({
      currentProject: action.entry,
      loading: true,
      error: null,
    });

    if (action.entry.source === 'local') {
      const content = state.localProjects[action.entry.name];
      ctx.patchState({
        currentFlags: content?.flags ?? {},
        currentEvaluators: content?.$evaluators,
        currentMetadata: content?.metadata,
        loading: false,
      });
      return;
    }

    return this.remoteApi.getProject(action.entry.backendUrl!, action.entry.name).pipe(
      tap((res) => {
        ctx.patchState({
          currentFlags: res.flags ?? {},
          currentEvaluators: res.$evaluators,
          currentMetadata: res.metadata,
          loading: false,
        });
      }),
      catchError((err) => {
        ctx.patchState({
          error: `Failed to load project "${action.entry.name}"`,
          currentFlags: null,
          currentEvaluators: undefined,
          currentMetadata: undefined,
          loading: false,
        });
        console.error('Failed to load project', err);
        return of(void 0);
      }),
    );
  }

  @Action(SelectProjectByRoute)
  selectProjectByRoute(
    ctx: StateContext<FlagStoreStateModel>,
    action: SelectProjectByRoute,
  ): Observable<unknown> | void {
    if (action.source === 'local') {
      return ctx.dispatch(new SelectProject({ name: action.name, source: 'local' }));
    }

    if (!action.backendId) {
      return;
    }

    const backend = ctx.getState().backends.find((entry) => entry.id === action.backendId);
    if (!backend) {
      ctx.patchState({ error: `Backend "${action.backendId}" not found` });
      return;
    }

    return ctx.dispatch(
      new SelectProject({
        name: action.name,
        source: 'remote',
        backendUrl: backend.url,
      }),
    );
  }

  @Action(CreateLocalProject)
  createLocalProject(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateLocalProject,
  ): Observable<unknown> {
    const state = ctx.getState();

    if (state.localProjects[action.name]) {
      ctx.patchState({ error: `Project "${action.name}" already exists` });
      return of(void 0);
    }

    ctx.patchState({
      error: null,
      localProjects: {
        ...state.localProjects,
        [action.name]: { flags: {} },
      },
    });

    return ctx.dispatch(new LoadProjects()).pipe(
      tap(() => {
        void this.router.navigate(['/projects', 'local', action.name]);
      }),
      switchMap(() => of(void 0)),
    );
  }

  @Action(CreateRemoteProject)
  createRemoteProject(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateRemoteProject,
  ): Observable<unknown> {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    return this.remoteApi.createProject(action.backendUrl, action.name, { flags: {} }).pipe(
      switchMap(() => ctx.dispatch(new LoadProjects())),
      tap(() => {
        const backend = state.backends.find((entry) => entry.url === action.backendUrl);
        if (backend) {
          void this.router.navigate(['/projects', 'remote', backend.id, action.name]);
        }
      }),
      switchMap(() => of(void 0)),
      catchError((err) => {
        ctx.patchState({
          error: `Failed to create project "${action.name}"`,
          loading: false,
        });
        console.error('Failed to create project', err);
        return of(void 0);
      }),
    );
  }

  @Action(DeleteProject)
  deleteProject(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteProject,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    const isCurrent =
      state.currentProject?.name === action.entry.name &&
      state.currentProject?.source === action.entry.source;

    if (action.entry.source === 'local') {
      const nextLocalProjects = { ...state.localProjects };
      delete nextLocalProjects[action.entry.name];

      ctx.patchState({
        localProjects: nextLocalProjects,
        ...(isCurrent
          ? {
              currentProject: null,
              currentFlags: null,
              currentMetadata: undefined,
              currentEvaluators: undefined,
            }
          : {}),
      });

      if (isCurrent) {
        void this.router.navigate(['/']);
      }

      return ctx.dispatch(new LoadProjects()).pipe(switchMap(() => of(void 0)));
    }

    return this.remoteApi.deleteProject(action.entry.backendUrl!, action.entry.name).pipe(
      switchMap(() => {
        if (isCurrent) {
          ctx.patchState({
            currentProject: null,
            currentFlags: null,
            currentMetadata: undefined,
            currentEvaluators: undefined,
          });
          void this.router.navigate(['/']);
        }
        return ctx.dispatch(new LoadProjects());
      }),
      switchMap(() => of(void 0)),
      catchError((err) => {
        ctx.patchState({
          error: `Failed to delete project "${action.entry.name}"`,
          loading: false,
        });
        console.error('Failed to delete project', err);
        return of(void 0);
      }),
    );
  }

  @Action(SaveFlag)
  saveFlag(ctx: StateContext<FlagStoreStateModel>, action: SaveFlag): Observable<unknown> | void {
    const state = ctx.getState();
    const project = state.currentProject;
    if (!project) return;

    const updatedFlags = {
      ...(state.currentFlags ?? {}),
      [action.key]: action.flag,
    };
    const metadata = state.currentMetadata;
    const content = this.buildProjectContent(updatedFlags, metadata, state.currentEvaluators);

    return this.persistCurrentProjectContent(
      ctx,
      project,
      content,
      {
        currentFlags: updatedFlags,
        currentMetadata: metadata,
      },
      `Failed to save flag "${action.key}"`,
    );
  }

  @Action(DeleteFlag)
  deleteFlag(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteFlag,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    const project = state.currentProject;
    if (!project || !state.currentFlags) return;

    const updatedFlags = { ...state.currentFlags };
    delete updatedFlags[action.key];

    const metadata = state.currentMetadata;
    const content = this.buildProjectContent(updatedFlags, metadata, state.currentEvaluators);

    return this.persistCurrentProjectContent(
      ctx,
      project,
      content,
      {
        currentFlags: updatedFlags,
        currentMetadata: metadata,
      },
      `Failed to delete flag "${action.key}"`,
    );
  }

  @Action(RenameFlag)
  renameFlag(
    ctx: StateContext<FlagStoreStateModel>,
    action: RenameFlag,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    const project = state.currentProject;
    if (!project) return;

    const updatedFlags = { ...(state.currentFlags ?? {}) };
    delete updatedFlags[action.oldKey];
    updatedFlags[action.newKey] = action.flag;

    const metadata = state.currentMetadata;
    const content = this.buildProjectContent(updatedFlags, metadata, state.currentEvaluators);

    return this.persistCurrentProjectContent(
      ctx,
      project,
      content,
      {
        currentFlags: updatedFlags,
        currentMetadata: metadata,
      },
      `Failed to rename flag "${action.oldKey}"`,
    );
  }

  @Action(ImportLocalProject)
  importLocalProject(
    ctx: StateContext<FlagStoreStateModel>,
    action: ImportLocalProject,
  ): Observable<unknown> {
    const state = ctx.getState();
    ctx.patchState({
      localProjects: {
        ...state.localProjects,
        [action.name]: action.content,
      },
    });

    return ctx.dispatch(new LoadProjects()).pipe(
      tap(() => {
        void this.router.navigate(['/projects', 'local', action.name]);
      }),
      switchMap(() => of(void 0)),
    );
  }

  @Action(SaveProjectMetadata)
  saveProjectMetadata(
    ctx: StateContext<FlagStoreStateModel>,
    action: SaveProjectMetadata,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    const project = state.currentProject;
    const flags = state.currentFlags;
    if (!project || !flags) return;

    const content = this.buildProjectContent(flags, action.metadata, state.currentEvaluators);

    return this.persistCurrentProjectContent(
      ctx,
      project,
      content,
      {
        currentMetadata: action.metadata,
      },
      'Failed to save project metadata',
    );
  }

  @Action(UpdateEvaluators)
  updateEvaluators(
    ctx: StateContext<FlagStoreStateModel>,
    action: UpdateEvaluators,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    const project = state.currentProject;
    if (!project) return;

    const flags = state.currentFlags ?? {};
    const metadata = state.currentMetadata;
    const content = this.buildProjectContent(flags, metadata, action.evaluators);

    return this.persistCurrentProjectContent(
      ctx,
      project,
      content,
      {
        currentEvaluators: action.evaluators,
      },
      'Failed to update environments',
    );
  }

  private persistCurrentProjectContent(
    ctx: StateContext<FlagStoreStateModel>,
    project: ProjectEntry,
    content: FlagFileContent,
    patch: Partial<FlagStoreStateModel>,
    errorMessage: string,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    if (project.source === 'local') {
      ctx.patchState({
        ...patch,
        localProjects: {
          ...state.localProjects,
          [project.name]: content,
        },
        loading: false,
      });
      return;
    }

    return this.remoteApi.updateProject(project.backendUrl!, project.name, content).pipe(
      tap(() => {
        ctx.patchState({
          ...patch,
          loading: false,
        });
      }),
      catchError((err) => {
        ctx.patchState({
          error: errorMessage,
          loading: false,
        });
        console.error(errorMessage, err);
        return of(void 0);
      }),
    );
  }

  private buildProjectContent(
    flags: Record<string, FlagDefinition>,
    metadata: MetadataMap | undefined,
    evaluators: Record<string, Evaluator> | undefined,
  ): FlagFileContent {
    const content: FlagFileContent = {
      $schema: 'https://flagd.dev/schema/v0/flags.json',
      flags,
    };

    if (evaluators && Object.keys(evaluators).length > 0) {
      content.$evaluators = evaluators;
    }

    if (metadata && Object.keys(metadata).length > 0) {
      content.metadata = metadata;
    }

    return content;
  }

  private normalizeBackendUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private inferBackendLabel(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }
}