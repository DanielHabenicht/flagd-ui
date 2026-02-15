import { inject, Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { Router } from '@angular/router';
import { catchError, forkJoin, from, Observable, of, switchMap, tap } from 'rxjs';
import {
  BackendInstance,
  Environment,
  Evaluator,
  extractEnvironments,
  FlagsFileEntry,
  FlagDefinition,
  FlagEntry,
  FlagFileContent,
  FileGroup,
  LocalFlagsFileOrigin,
  MetadataMap,
} from '../models/flag.models';
import { RemoteApi } from '../services/remote-api';
import { FileSystemAccess } from '../services/file-system-access';
import {
  AddBackend,
  CreateLocalFlagsFile,
  CreateLocalFlagsFileEntry,
  CreateRemoteFlagsFile,
  DeleteFlag,
  DeleteLocalFlagsFileEntry,
  DeleteFlagsFile,
  ImportLocalFlagsFile,
  LoadFlagsFiles,
  RemoveBackend,
  RenameFlag,
  SaveFlag,
  SaveLocalFlagsFileContent,
  SaveFlagsFileMetadata,
  SelectFlagsFile,
  SelectFlagsFileByRoute,
  SetHasDefaultBackend,
  UpdateEvaluators,
} from './flag-store.actions';

export interface FlagStoreStateModel {
  flagsFiles: FlagsFileEntry[];
  currentFlagsFile: FlagsFileEntry | null;
  currentFlags: Record<string, FlagDefinition> | null;
  currentEvaluators: Record<string, Evaluator> | undefined;
  currentMetadata: MetadataMap | undefined;
  loading: boolean;
  error: string | null;
  hasDefaultBackend: boolean;
  localFlagsFiles: Record<string, FlagFileContent>;
  localFileOrigins: Record<string, LocalFlagsFileOrigin>;
  backends: BackendInstance[];
}

@State<FlagStoreStateModel>({
  name: 'flagStore',
  defaults: {
    flagsFiles: [],
    currentFlagsFile: null,
    currentFlags: null,
    currentEvaluators: undefined,
    currentMetadata: undefined,
    loading: false,
    error: null,
    hasDefaultBackend: false,
    localFlagsFiles: {},
    localFileOrigins: {},
    backends: [],
  },
})
@Injectable()
export class FlagStoreState {
  private readonly remoteApi = inject(RemoteApi);
  private readonly router = inject(Router);
  private readonly fileSystemAccess = inject(FileSystemAccess);

  @Selector()
  static flagsFiles(state: FlagStoreStateModel): FlagsFileEntry[] {
    return state.flagsFiles;
  }

  @Selector()
  static currentFlagsFile(state: FlagStoreStateModel): FlagsFileEntry | null {
    return state.currentFlagsFile;
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
      const entries = state.flagsFiles.filter(
        (flagsFile) => flagsFile.source === 'remote' && flagsFile.backendUrl === backend.url,
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

    const localDiskEntries = state.flagsFiles.filter(
      (flagsFile) => flagsFile.source === 'local' && flagsFile.localOrigin === 'disk',
    );
    if (localDiskEntries.length > 0) {
      groups.push({ label: 'Local Files (Disk)', icon: 'save', entries: localDiskEntries });
    }

    const localBrowserEntries = state.flagsFiles.filter(
      (flagsFile) =>
        flagsFile.source === 'local' && (flagsFile.localOrigin ?? 'browser') !== 'disk',
    );
    if (localBrowserEntries.length > 0) {
      groups.push({
        label: 'Local Files (Browser)',
        icon: 'language',
        entries: localBrowserEntries,
      });
    }

    return groups;
  }

  @Selector()
  static localFlagsFiles(state: FlagStoreStateModel): Record<string, FlagFileContent> {
    return state.localFlagsFiles;
  }

  @Selector()
  static currentFlagsFileName(state: FlagStoreStateModel): string | null {
    return state.currentFlagsFile?.name ?? null;
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
      id: this.getBackendIdFromUrl(normalized, state.backends),
      url: normalized,
      label: action.label || this.inferBackendLabel(normalized),
    };

    ctx.patchState({ backends: [...state.backends, instance] });
  }

  @Action(RemoveBackend)
  removeBackend(ctx: StateContext<FlagStoreStateModel>, action: RemoveBackend): void {
    const state = ctx.getState();
    const removedBackend = state.backends.find((backend) => backend.id === action.id);
    if (!removedBackend) {
      return;
    }

    const nextFlagsFiles = state.flagsFiles.filter(
      (entry) => !(entry.source === 'remote' && entry.backendUrl === removedBackend.url),
    );
    const isCurrentRemovedBackend =
      state.currentFlagsFile?.source === 'remote' &&
      state.currentFlagsFile.backendUrl === removedBackend.url;

    ctx.patchState({
      backends: state.backends.filter((backend) => backend.id !== action.id),
      flagsFiles: nextFlagsFiles,
      ...(isCurrentRemovedBackend
        ? {
            currentFlagsFile: null,
            currentFlags: null,
            currentEvaluators: undefined,
            currentMetadata: undefined,
          }
        : {}),
    });

    if (isCurrentRemovedBackend) {
      void this.router.navigate(['/']);
    }
  }

  @Action(SaveLocalFlagsFileContent)
  saveLocalFlagsFileContent(
    ctx: StateContext<FlagStoreStateModel>,
    action: SaveLocalFlagsFileContent,
  ): void {
    const state = ctx.getState();
    ctx.patchState({
      localFlagsFiles: {
        ...state.localFlagsFiles,
        [action.name]: action.content,
      },
    });
  }

  @Action(CreateLocalFlagsFileEntry)
  createLocalFlagsFileEntry(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateLocalFlagsFileEntry,
  ): void {
    const state = ctx.getState();
    if (state.localFlagsFiles[action.name]) {
      throw new Error(`Flags-file "${action.name}" already exists`);
    }

    ctx.patchState({
      localFlagsFiles: {
        ...state.localFlagsFiles,
        [action.name]: { flags: {} },
      },
      localFileOrigins: {
        ...state.localFileOrigins,
        [action.name]: 'browser',
      },
    });
  }

  @Action(DeleteLocalFlagsFileEntry)
  deleteLocalFlagsFileEntry(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteLocalFlagsFileEntry,
  ): void {
    const state = ctx.getState();
    const existing = state.localFlagsFiles[action.name];
    if (!existing) {
      throw new Error(`Flags-file "${action.name}" not found`);
    }

    const nextLocalFlagsFiles = { ...state.localFlagsFiles };
    const nextLocalFileOrigins = { ...state.localFileOrigins };
    delete nextLocalFlagsFiles[action.name];
    delete nextLocalFileOrigins[action.name];
    ctx.patchState({
      localFlagsFiles: nextLocalFlagsFiles,
      localFileOrigins: nextLocalFileOrigins,
    });
  }

  @Action(LoadFlagsFiles)
  loadFlagsFiles(ctx: StateContext<FlagStoreStateModel>): Observable<unknown> | void {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    const localEntries: FlagsFileEntry[] = Object.keys(state.localFlagsFiles)
      .sort()
      .map((name) => ({
        name,
        source: 'local' as const,
        localOrigin: state.localFileOrigins[name] ?? 'browser',
      }));

    if (state.backends.length === 0) {
      ctx.patchState({ flagsFiles: localEntries, loading: false });
      return;
    }

    const remoteRequests = state.backends.map((backend) =>
      this.remoteApi.listFlagsFiles(backend.url).pipe(
        catchError((err) => {
          console.error(`Failed to load flags-files from ${backend.url}`, err);
          return of([] as string[]);
        }),
      ),
    );

    return forkJoin(remoteRequests).pipe(
      tap((results) => {
        const remoteEntries: FlagsFileEntry[] = [];
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
          flagsFiles: [...localEntries, ...remoteEntries],
          loading: false,
        });
      }),
      catchError((err) => {
        ctx.patchState({
          flagsFiles: localEntries,
          error: 'Failed to load remote flags-files',
          loading: false,
        });
        console.error('Failed to load remote flags-files', err);
        return of(void 0);
      }),
    );
  }

  @Action(SelectFlagsFile)
  selectFlagsFile(
    ctx: StateContext<FlagStoreStateModel>,
    action: SelectFlagsFile,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    const current = state.currentFlagsFile;

    const isSameFlagsFile =
      current?.name === action.entry.name &&
      current?.source === action.entry.source &&
      (current?.backendUrl ?? '') === (action.entry.backendUrl ?? '');

    if (isSameFlagsFile && (state.loading || state.currentFlags !== null)) {
      return;
    }

    ctx.patchState({
      currentFlagsFile: action.entry,
      loading: true,
      error: null,
    });

    if (action.entry.source === 'local') {
      const content = state.localFlagsFiles[action.entry.name];
      ctx.patchState({
        currentFlags: content?.flags ?? {},
        currentEvaluators: content?.$evaluators,
        currentMetadata: content?.metadata,
        loading: false,
      });
      return;
    }

    return this.remoteApi.getFlagsFile(action.entry.backendUrl!, action.entry.name).pipe(
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
          error: `Failed to load flags-file "${action.entry.name}"`,
          currentFlags: null,
          currentEvaluators: undefined,
          currentMetadata: undefined,
          loading: false,
        });
        console.error('Failed to load flags-file', err);
        return of(void 0);
      }),
    );
  }

  @Action(SelectFlagsFileByRoute)
  selectFlagsFileByRoute(
    ctx: StateContext<FlagStoreStateModel>,
    action: SelectFlagsFileByRoute,
  ): Observable<unknown> | void {
    if (action.source === 'local') {
      return ctx.dispatch(new SelectFlagsFile({ name: action.name, source: 'local' }));
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
      new SelectFlagsFile({
        name: action.name,
        source: 'remote',
        backendUrl: backend.url,
      }),
    );
  }

  @Action(CreateLocalFlagsFile)
  createLocalFlagsFile(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateLocalFlagsFile,
  ): Observable<unknown> {
    const state = ctx.getState();

    if (state.localFlagsFiles[action.name]) {
      ctx.patchState({ error: `Flags-file "${action.name}" already exists` });
      return of(void 0);
    }

    ctx.patchState({
      error: null,
      localFlagsFiles: {
        ...state.localFlagsFiles,
        [action.name]: { flags: {} },
      },
      localFileOrigins: {
        ...state.localFileOrigins,
        [action.name]: 'browser',
      },
    });

    return ctx.dispatch(new LoadFlagsFiles()).pipe(
      tap(() => {
        void this.router.navigate(['/flags-files', 'local', action.name]);
      }),
      switchMap(() => of(void 0)),
    );
  }

  @Action(CreateRemoteFlagsFile)
  createRemoteFlagsFile(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateRemoteFlagsFile,
  ): Observable<unknown> {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    return this.remoteApi.createFlagsFile(action.backendUrl, action.name, { flags: {} }).pipe(
      switchMap(() => ctx.dispatch(new LoadFlagsFiles())),
      tap(() => {
        const backend = state.backends.find((entry) => entry.url === action.backendUrl);
        if (backend) {
          void this.router.navigate(['/flags-files', 'remote', backend.id, action.name]);
        }
      }),
      switchMap(() => of(void 0)),
      catchError((err) => {
        ctx.patchState({
          error: `Failed to create flags-file "${action.name}"`,
          loading: false,
        });
        console.error('Failed to create flags-file', err);
        return of(void 0);
      }),
    );
  }

  @Action(DeleteFlagsFile)
  deleteFlagsFile(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteFlagsFile,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    const isCurrent =
      state.currentFlagsFile?.name === action.entry.name &&
      state.currentFlagsFile?.source === action.entry.source;

    if (action.entry.source === 'local') {
      const nextLocalFlagsFiles = { ...state.localFlagsFiles };
      const nextLocalFileOrigins = { ...state.localFileOrigins };
      delete nextLocalFlagsFiles[action.entry.name];
      delete nextLocalFileOrigins[action.entry.name];
      this.fileSystemAccess.unbindFlagsFile(action.entry.name);

      ctx.patchState({
        localFlagsFiles: nextLocalFlagsFiles,
        localFileOrigins: nextLocalFileOrigins,
        ...(isCurrent
          ? {
              currentFlagsFile: null,
              currentFlags: null,
              currentMetadata: undefined,
              currentEvaluators: undefined,
            }
          : {}),
      });

      if (isCurrent) {
        void this.router.navigate(['/']);
      }

      return ctx.dispatch(new LoadFlagsFiles()).pipe(switchMap(() => of(void 0)));
    }

    return this.remoteApi.deleteFlagsFile(action.entry.backendUrl!, action.entry.name).pipe(
      switchMap(() => {
        if (isCurrent) {
          ctx.patchState({
            currentFlagsFile: null,
            currentFlags: null,
            currentMetadata: undefined,
            currentEvaluators: undefined,
          });
          void this.router.navigate(['/']);
        }
        return ctx.dispatch(new LoadFlagsFiles());
      }),
      switchMap(() => of(void 0)),
      catchError((err) => {
        ctx.patchState({
          error: `Failed to delete flags-file "${action.entry.name}"`,
          loading: false,
        });
        console.error('Failed to delete flags-file', err);
        return of(void 0);
      }),
    );
  }

  @Action(SaveFlag)
  saveFlag(ctx: StateContext<FlagStoreStateModel>, action: SaveFlag): Observable<unknown> | void {
    const state = ctx.getState();
    const flagsFile = state.currentFlagsFile;
    if (!flagsFile) return;

    const updatedFlags = {
      ...(state.currentFlags ?? {}),
      [action.key]: action.flag,
    };
    const metadata = state.currentMetadata;
    const content = this.buildFlagsFileContent(updatedFlags, metadata, state.currentEvaluators);

    return this.persistCurrentFlagsFileContent(
      ctx,
      flagsFile,
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
    const flagsFile = state.currentFlagsFile;
    if (!flagsFile || !state.currentFlags) return;

    const updatedFlags = { ...state.currentFlags };
    delete updatedFlags[action.key];

    const metadata = state.currentMetadata;
    const content = this.buildFlagsFileContent(updatedFlags, metadata, state.currentEvaluators);

    return this.persistCurrentFlagsFileContent(
      ctx,
      flagsFile,
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
    const flagsFile = state.currentFlagsFile;
    if (!flagsFile) return;

    const updatedFlags = { ...(state.currentFlags ?? {}) };
    delete updatedFlags[action.oldKey];
    updatedFlags[action.newKey] = action.flag;

    const metadata = state.currentMetadata;
    const content = this.buildFlagsFileContent(updatedFlags, metadata, state.currentEvaluators);

    return this.persistCurrentFlagsFileContent(
      ctx,
      flagsFile,
      content,
      {
        currentFlags: updatedFlags,
        currentMetadata: metadata,
      },
      `Failed to rename flag "${action.oldKey}"`,
    );
  }

  @Action(ImportLocalFlagsFile)
  importLocalFlagsFile(
    ctx: StateContext<FlagStoreStateModel>,
    action: ImportLocalFlagsFile,
  ): Observable<unknown> {
    const state = ctx.getState();
    ctx.patchState({
      localFlagsFiles: {
        ...state.localFlagsFiles,
        [action.name]: action.content,
      },
      localFileOrigins: {
        ...state.localFileOrigins,
        [action.name]: action.origin,
      },
    });

    return ctx.dispatch(new LoadFlagsFiles()).pipe(
      tap(() => {
        void this.router.navigate(['/flags-files', 'local', action.name]);
      }),
      switchMap(() => of(void 0)),
    );
  }

  @Action(SaveFlagsFileMetadata)
  saveFlagsFileMetadata(
    ctx: StateContext<FlagStoreStateModel>,
    action: SaveFlagsFileMetadata,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    const flagsFile = state.currentFlagsFile;
    const flags = state.currentFlags;
    if (!flagsFile || !flags) return;

    const content = this.buildFlagsFileContent(flags, action.metadata, state.currentEvaluators);

    return this.persistCurrentFlagsFileContent(
      ctx,
      flagsFile,
      content,
      {
        currentMetadata: action.metadata,
      },
      'Failed to save flags-file metadata',
    );
  }

  @Action(UpdateEvaluators)
  updateEvaluators(
    ctx: StateContext<FlagStoreStateModel>,
    action: UpdateEvaluators,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    const flagsFile = state.currentFlagsFile;
    if (!flagsFile) return;

    const flags = state.currentFlags ?? {};
    const metadata = state.currentMetadata;
    const content = this.buildFlagsFileContent(flags, metadata, action.evaluators);

    return this.persistCurrentFlagsFileContent(
      ctx,
      flagsFile,
      content,
      {
        currentEvaluators: action.evaluators,
      },
      'Failed to update environments',
    );
  }

  private persistCurrentFlagsFileContent(
    ctx: StateContext<FlagStoreStateModel>,
    flagsFile: FlagsFileEntry,
    content: FlagFileContent,
    patch: Partial<FlagStoreStateModel>,
    errorMessage: string,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    if (flagsFile.source === 'local') {
      ctx.patchState({
        ...patch,
        localFlagsFiles: {
          ...state.localFlagsFiles,
          [flagsFile.name]: content,
        },
        loading: false,
      });

      return from(this.fileSystemAccess.persistBoundFlagsFile(flagsFile.name, content)).pipe(
        switchMap(() => of(void 0)),
        catchError((err) => {
          ctx.patchState({
            error: `${errorMessage}: failed to write local file to disk`,
          });
          console.error('Failed to write local file to disk', err);
          return of(void 0);
        }),
      );
    }

    return this.remoteApi.updateFlagsFile(flagsFile.backendUrl!, flagsFile.name, content).pipe(
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

  private buildFlagsFileContent(
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

  private getBackendIdFromUrl(url: string, existingBackends: BackendInstance[]): string {
    const baseId = this.getBackendDomain(url);
    const usedIds = new Set(existingBackends.map((backend) => backend.id));
    if (!usedIds.has(baseId)) {
      return baseId;
    }

    let suffix = 2;
    while (usedIds.has(`${baseId}-${suffix}`)) {
      suffix += 1;
    }

    return `${baseId}-${suffix}`;
  }

  private getBackendDomain(url: string): string {
    if (!url) {
      return 'local';
    }

    try {
      return new URL(url).hostname || 'local';
    } catch {
      const sanitized = url
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/[^a-z0-9.-]/g, '-');
      return sanitized || 'local';
    }
  }
}
