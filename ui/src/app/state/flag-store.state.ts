import { inject, Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { Navigate } from '@ngxs/router-plugin';
import { catchError, forkJoin, from, Observable, of, switchMap, tap } from 'rxjs';
import { RemoteApi } from '../services/remote-api';
import { FileSystemAccess } from '../services/file-system-access';
import { FlagdSchemaAbstraction } from '../models/abstraction/flagd-schema-abstraction';
import { DisplayFlag, Environment } from '../models/abstraction/flagd-abstraction-models';

// Private file storage types - not exposed to consumers
type FileSource = 'remote' | 'local-browser' | 'local-disk';

interface FileMetadata {
  name: string;
  source: FileSource;
  backendId?: string;
}

interface BackendInstance {
  id: string;
  url: string;
  label: string;
}

interface ParsedFileState {
  displayFlags: DisplayFlag[];
  environments: Environment[];
  metadata: Record<string, string | number | boolean> | undefined;
}

interface FileGroup {
  label: string;
  icon: string;
  backendId?: string;
  entries: FileMetadata[];
}
import {
  AddBackend,
  CreateFlagsFile,
  DeleteFlag,
  DeleteFlagsFile,
  ImportLocalFlagsFile,
  LoadFlagsFiles,
  RemoveBackend,
  RenameFlag,
  SaveFlag,
  SaveFlagsFileMetadata,
  SelectFlagsFile,
  SelectFlagsFileByRoute,
  SetHasDefaultBackend,
  UpdateEvaluators,
} from './flag-store.actions';

export interface FlagStoreStateModel {
  // Unified file storage: metadata and content stored separately
  files: FileMetadata[];
  filesContent: Record<string, string>; // Map of file key to raw JSON string

  // Backend connections
  backends: BackendInstance[];

  // Current file selection - stores file key
  currentFileId: string | null;

  // Cached parsed data from current file
  currentFileParsed: ParsedFileState | null;

  // Loading and error states
  loading: boolean;
  error: string | null;
  hasDefaultBackend: boolean;
}

@State<FlagStoreStateModel>({
  name: 'flagStore',
  defaults: {
    files: [],
    filesContent: {},
    backends: [],
    currentFileId: null,
    currentFileParsed: null,
    loading: false,
    error: null,
    hasDefaultBackend: false,
  },
})
@Injectable()
export class FlagStoreState {
  private readonly remoteApi = inject(RemoteApi);
  private readonly fileSystemAccess = inject(FileSystemAccess);

  @Selector()
  static files(state: FlagStoreStateModel): FileMetadata[] {
    return state.files;
  }

  @Selector()
  static currentFile(state: FlagStoreStateModel): FileMetadata | null {
    if (!state.currentFileId) return null;
    return state.files.find((f) => FlagStoreState.getFileKey(f) === state.currentFileId) || null;
  }

  // Backward compatibility aliases
  @Selector()
  static currentFlagsFile(state: FlagStoreStateModel): FileMetadata | null {
    return FlagStoreState.currentFile(state);
  }

  @Selector()
  static currentFlagsFileName(state: FlagStoreStateModel): string | null {
    return FlagStoreState.currentFileName(state);
  }

  @Selector()
  static currentFileParsed(state: FlagStoreStateModel): ParsedFileState | null {
    return state.currentFileParsed;
  }

  @Selector()
  static currentFlags(state: FlagStoreStateModel): DisplayFlag[] | null {
    return state.currentFileParsed?.displayFlags || null;
  }

  @Selector()
  static currentEnvironments(state: FlagStoreStateModel): Environment[] {
    return state.currentFileParsed?.environments || [];
  }

  @Selector()
  static currentMetadata(
    state: FlagStoreStateModel,
  ): Record<string, string | number | boolean> | undefined {
    return state.currentFileParsed?.metadata;
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
  static fileGroups(state: FlagStoreStateModel): FileGroup[] {
    const groups: FileGroup[] = [];

    // Group remote files by backend
    for (const backend of state.backends) {
      const entries = state.files.filter(
        (file) => file.source === 'remote' && file.backendId === backend.id,
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

    // Group local disk files
    const localDiskEntries = state.files.filter(
      (file) => file.source === 'local-disk',
    );
    if (localDiskEntries.length > 0) {
      groups.push({ label: 'Local Files (Disk)', icon: 'save', entries: localDiskEntries });
    }

    // Group local browser files
    const localBrowserEntries = state.files.filter(
      (file) => file.source === 'local-browser',
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
  static currentFileName(state: FlagStoreStateModel): string | null {
    if (!state.currentFileId) return null;
    const currentFile = state.files.find((f) => FlagStoreState.getFileKey(f) === state.currentFileId);
    return currentFile?.name ?? null;
  }

  @Selector()
  static flagEntries(state: FlagStoreStateModel): (DisplayFlag & { key: string })[] {
    return (state.currentFileParsed?.displayFlags ?? []).map((f) => ({
      ...f,
      key: f.key,
    }));
  }

  @Selector()
  static currentEvaluators(state: FlagStoreStateModel): Record<string, unknown> | undefined {
    // Build evaluators from environments for backward compatibility
    if (!state.currentFileParsed || !state.currentFileParsed.environments) {
      return undefined;
    }

    const evaluators: Record<string, unknown> = {};
    for (const env of state.currentFileParsed.environments) {
      const envKey =
        'is' + env.displayName.charAt(0).toUpperCase() + env.displayName.slice(1);
      evaluators[envKey] = {
        in: [{ var: 'environment' }, env.aliases],
      };
    }

    return Object.keys(evaluators).length > 0 ? evaluators : undefined;
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

    // Remove all files from this backend
    const nextFiles = state.files.filter(
      (file) => !(file.source === 'remote' && file.backendId === removedBackend.id),
    );

    // Remove content for deleted files
    const nextContent: Record<string, string> = {};
    for (const file of nextFiles) {
      const fileKey = FlagStoreState.getFileKey(file);
      if (state.filesContent[fileKey]) {
        nextContent[fileKey] = state.filesContent[fileKey];
      }
    }

    const isCurrentRemovedBackend =
      state.currentFileId &&
      state.files.find((f) => FlagStoreState.getFileKey(f) === state.currentFileId)?.source === 'remote' &&
      state.files.find((f) => FlagStoreState.getFileKey(f) === state.currentFileId)?.backendId === removedBackend.id;

    ctx.patchState({
      backends: state.backends.filter((backend) => backend.id !== action.id),
      files: nextFiles,
      filesContent: nextContent,
      ...(isCurrentRemovedBackend
        ? {
            currentFileId: null,
            currentFileParsed: null,
          }
        : {}),
    });

    if (isCurrentRemovedBackend) {
      ctx.dispatch(new Navigate(['/'], undefined, { queryParamsHandling: 'merge' }));
    }
  }

  @Action(LoadFlagsFiles)
  loadFlagsFiles(ctx: StateContext<FlagStoreStateModel>): Observable<unknown> | void {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    // Load local files first - these are already stored in filesContent
    const localFiles: FileMetadata[] = [];
    const existingLocalIds = new Set<string>();

    for (const fileKey of Object.keys(state.filesContent)) {
      const file = state.files.find((f) => FlagStoreState.getFileKey(f) === fileKey && (f.source === 'local-browser' || f.source === 'local-disk'));
      if (file) {
        localFiles.push(file);
        existingLocalIds.add(fileKey);
      }
    }

    if (state.backends.length === 0) {
      ctx.patchState({ files: localFiles, loading: false });
      return;
    }

    // Load remote files from all backends
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
        const remoteFiles: FileMetadata[] = [];

        results.forEach((names, index) => {
          const backend = state.backends[index];
          names.forEach((name) => {
            remoteFiles.push({
              name,
              source: 'remote',
              backendId: backend.id,
            });
          });
        });

        ctx.patchState({
          files: [...localFiles, ...remoteFiles],
          loading: false,
        });
      }),
      catchError((err) => {
        ctx.patchState({
          files: localFiles,
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
    const fileKey = action.fileId;
    const file = state.files.find((f) => FlagStoreState.getFileKey(f) === fileKey);

    if (!file) {
      ctx.patchState({ error: `Flags-file not found` });
      return;
    }

    // If already loaded, skip
    if (state.currentFileId === fileKey && state.currentFileParsed !== null) {
      return;
    }

    ctx.patchState({
      currentFileId: fileKey,
      loading: true,
      error: null,
    });

    // For local files, content is already in filesContent
    if (file.source === 'local-browser' || file.source === 'local-disk') {
      const content = state.filesContent[fileKey];
      if (content) {
        this.parseAndLoadFile(ctx, fileKey, content, file);
      } else {
        ctx.patchState({
          error: `File content not found for "${file.name}"`,
          loading: false,
        });
      }
      return;
    }

    // For remote files, fetch from backend
    const backend = state.backends.find((b) => b.id === file.backendId);
    if (!backend) {
      ctx.patchState({
        error: `Backend not found for "${file.name}"`,
        loading: false,
      });
      return;
    }

    return this.remoteApi.getFlagsFile(backend.url, file.name).pipe(
      tap((res) => {
        const contentString = JSON.stringify(res);
        // Store the content and parse
        const nextContent = { ...state.filesContent, [fileKey]: contentString };
        ctx.patchState({ filesContent: nextContent });
        this.parseAndLoadFile(ctx, fileKey, contentString, file);
      }),
      catchError((err) => {
        ctx.patchState({
          error: `Failed to load flags-file "${file.name}"`,
          loading: false,
        });
        console.error('Failed to load flags-file', err);
        return of(void 0);
      }),
    );
  }

  private parseAndLoadFile(
    ctx: StateContext<FlagStoreStateModel>,
    fileKey: string,
    contentString: string,
    file: FileMetadata,
  ): void {
    try {
      const schema = JSON.parse(contentString);
      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);

      ctx.patchState({
        currentFileParsed: {
          displayFlags: abstraction.getFlags(),
          environments: abstraction.getEnvironments(),
          metadata: abstraction.getMetadata(),
        },
        loading: false,
      });
    } catch (err) {
      ctx.patchState({
        error: `Failed to parse flags-file "${file.name}": invalid JSON`,
        currentFileParsed: null,
        loading: false,
      });
      console.error('Failed to parse flags-file', err);
    }
  }

  @Action(SelectFlagsFileByRoute)
  selectFlagsFileByRoute(
    ctx: StateContext<FlagStoreStateModel>,
    action: SelectFlagsFileByRoute,
  ): Observable<unknown> | void {
    const state = ctx.getState();

    let file: FileMetadata | undefined;

    if (action.source === 'local') {
      file = state.files.find((f) => (f.source === 'local-browser' || f.source === 'local-disk') && f.name === action.name);
    } else if (action.backendId && action.name) {
      file = state.files.find(
        (f) => f.source === 'remote' && f.backendId === action.backendId && f.name === action.name,
      );
    }

    if (!file) {
      ctx.patchState({
        error: `Flags-file "${action.name}" not found`,
        currentFileId: null,
        currentFileParsed: null,
      });
      return;
    }

    return ctx.dispatch(new SelectFlagsFile(FlagStoreState.getFileKey(file)));
  }

  @Action(CreateFlagsFile)
  createFlagsFile(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateFlagsFile,
  ): Observable<unknown> {
    const state = ctx.getState();

    // Validate backendId for remote files
    if (action.source === 'remote' && !action.backendId) {
      ctx.patchState({ error: 'Backend ID is required for remote files' });
      return of(void 0);
    }

    // Check if file already exists
    const existingFile = state.files.find(
      (f) =>
        f.name === action.name &&
        (action.source === 'remote'
          ? f.source === 'remote' && f.backendId === action.backendId
          : f.source === action.source),
    );

    if (existingFile) {
      ctx.patchState({ error: `Flags-file "${action.name}" already exists` });
      return of(void 0);
    }

    const initialContent = action.content || { flags: {} };
    const contentString = JSON.stringify(initialContent);

    if (action.source === 'local-browser' || action.source === 'local-disk') {
      // Create local file
      const newFile: FileMetadata = {
        name: action.name,
        source: action.source,
      };

      const fileKey = FlagStoreState.getFileKey(newFile);

      ctx.patchState({
        error: null,
        files: [...state.files, newFile],
        filesContent: {
          ...state.filesContent,
          [fileKey]: contentString,
        },
      });

      return ctx.dispatch(new LoadFlagsFiles()).pipe(
        tap(() => {
          ctx.dispatch(
            new Navigate(['/flags-files', 'local', action.name], undefined, {
              queryParamsHandling: 'merge',
            }),
          );
        }),
        switchMap(() => of(void 0)),
      );
    } else if (action.source === 'remote' && action.backendId) {
      // Create remote file
      ctx.patchState({ loading: true, error: null });

      const backend = state.backends.find((b) => b.id === action.backendId);
      if (!backend) {
        ctx.patchState({
          error: `Backend "${action.backendId}" not found`,
          loading: false,
        });
        return of(void 0);
      }

      return this.remoteApi.createFlagsFile(backend.url, action.name, initialContent).pipe(
        switchMap(() => ctx.dispatch(new LoadFlagsFiles())),
        tap(() => {
          ctx.dispatch(
            new Navigate(['/flags-files', 'remote', action.backendId, action.name], undefined, {
              queryParamsHandling: 'merge',
            }),
          );
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

    ctx.patchState({ error: 'Invalid file source' });
    return of(void 0);
  }

  @Action(DeleteFlagsFile)
  deleteFlagsFile(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteFlagsFile,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    const file = state.files.find((f) => FlagStoreState.getFileKey(f) === action.fileId);
    if (!file) {
      ctx.patchState({
        error: `Flags-file not found`,
        loading: false,
      });
      return;
    }

    const fileKey = FlagStoreState.getFileKey(file);
    const isCurrent = state.currentFileId === fileKey;

    if (file.source === 'local-browser' || file.source === 'local-disk') {
      // For local files, remove from state and unbind from file system
      const nextFiles = state.files.filter((f) => FlagStoreState.getFileKey(f) !== fileKey);
      const nextContent = { ...state.filesContent };
      delete nextContent[fileKey];

      this.fileSystemAccess.unbindFlagsFile(file.name);

      ctx.patchState({
        files: nextFiles,
        filesContent: nextContent,
        ...(isCurrent
          ? {
              currentFileId: null,
              currentFileParsed: null,
            }
          : {}),
      });

      if (isCurrent) {
        ctx.dispatch(new Navigate(['/'], undefined, { queryParamsHandling: 'merge' }));
      }

      return ctx.dispatch(new LoadFlagsFiles()).pipe(switchMap(() => of(void 0)));
    }

    // For remote files, delete via API
    const backend = state.backends.find((b) => b.id === file.backendId);
    if (!backend) {
      ctx.patchState({
        error: `Backend not found for file "${file.name}"`,
        loading: false,
      });
      return;
    }

    return this.remoteApi.deleteFlagsFile(backend.url, file.name).pipe(
      switchMap(() => {
        if (isCurrent) {
          ctx.patchState({
            currentFileId: null,
            currentFileParsed: null,
          });
          ctx.dispatch(new Navigate(['/'], undefined, { queryParamsHandling: 'merge' }));
        }
        return ctx.dispatch(new LoadFlagsFiles());
      }),
      switchMap(() => of(void 0)),
      catchError((err) => {
        ctx.patchState({
          error: `Failed to delete flags-file "${file.name}"`,
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
    if (!state.currentFileId || !state.currentFileParsed) return;

    const file = state.files.find((f) => FlagStoreState.getFileKey(f) === state.currentFileId);
    if (!file) return;

    // Get current file content and parse it
    const contentString = state.filesContent[state.currentFileId];
    if (!contentString) return;

    try {
      const schema = JSON.parse(contentString);
      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);

      // Update the flag
      abstraction.createOrUpdateFlag(action.flag);

      // Export and persist
      return this.persistAndParseFile(ctx, state.currentFileId, abstraction, file);
    } catch (err) {
      ctx.patchState({
        error: `Failed to save flag "${action.flag.key}": ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
      console.error('Failed to save flag', err);
      return of(void 0);
    }
  }

  @Action(DeleteFlag)
  deleteFlag(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteFlag,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    if (!state.currentFileId || !state.currentFileParsed) return;

    const file = state.files.find((f) => FlagStoreState.getFileKey(f) === state.currentFileId);
    if (!file) return;

    // Get current file content and parse it
    const contentString = state.filesContent[state.currentFileId];
    if (!contentString) return;

    try {
      const schema = JSON.parse(contentString);
      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);

      // Delete the flag
      abstraction.deleteFlag(action.key);

      // Export and persist
      return this.persistAndParseFile(ctx, state.currentFileId, abstraction, file);
    } catch (err) {
      ctx.patchState({
        error: `Failed to delete flag "${action.key}": ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
      console.error('Failed to delete flag', err);
      return of(void 0);
    }
  }

  @Action(RenameFlag)
  renameFlag(
    ctx: StateContext<FlagStoreStateModel>,
    action: RenameFlag,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    if (!state.currentFileId || !state.currentFileParsed) return;

    const file = state.files.find((f) => FlagStoreState.getFileKey(f) === state.currentFileId);
    if (!file) return;

    // Get current file content and parse it
    const contentString = state.filesContent[state.currentFileId];
    if (!contentString) return;

    try {
      const schema = JSON.parse(contentString);
      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);

      // Update the flag with new key (previousKey triggers rename)
      abstraction.createOrUpdateFlag(action.flag, action.oldKey);

      // Export and persist
      return this.persistAndParseFile(ctx, state.currentFileId, abstraction, file);
    } catch (err) {
      ctx.patchState({
        error: `Failed to rename flag "${action.oldKey}": ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
      console.error('Failed to rename flag', err);
      return of(void 0);
    }
  }

  private persistAndParseFile(
    ctx: StateContext<FlagStoreStateModel>,
    fileKey: string,
    abstraction: FlagdSchemaAbstraction,
    file: FileMetadata,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    ctx.patchState({ loading: true, error: null });

    const updatedSchema = abstraction.exportSchema();
    const contentString = JSON.stringify(updatedSchema);

    const nextContent = {
      ...state.filesContent,
      [fileKey]: contentString,
    };

    if (file.source === 'local-browser' || file.source === 'local-disk') {
      // For local files, just update and trigger filesystem write
      ctx.patchState({
        filesContent: nextContent,
        currentFileParsed: {
          displayFlags: abstraction.getFlags(),
          environments: abstraction.getEnvironments(),
          metadata: abstraction.getMetadata(),
        },
      });

      // Parse the content for file system storage
      const fileContent = JSON.parse(contentString);
      return from(this.fileSystemAccess.persistBoundFlagsFile(file.name, fileContent)).pipe(
        tap(() => {
          ctx.patchState({ loading: false });
        }),
        catchError((err) => {
          ctx.patchState({
            error: `Failed to write changes to disk`,
            loading: false,
          });
          console.error('Failed to write file to disk', err);
          return of(void 0);
        }),
      );
    }

    // For remote files, update via API
    const backend = state.backends.find((b) => b.id === file.backendId);
    if (!backend) {
      ctx.patchState({
        error: `Backend not found`,
        loading: false,
      });
      return of(void 0);
    }

    const fileContent = JSON.parse(contentString);
    return this.remoteApi.updateFlagsFile(backend.url, file.name, fileContent).pipe(
      tap(() => {
        ctx.patchState({
          filesContent: nextContent,
          currentFileParsed: {
            displayFlags: abstraction.getFlags(),
            environments: abstraction.getEnvironments(),
            metadata: abstraction.getMetadata(),
          },
          loading: false,
        });
      }),
      catchError((err) => {
        ctx.patchState({
          error: `Failed to save changes to backend`,
          loading: false,
        });
        console.error('Failed to update file on backend', err);
        return of(void 0);
      }),
    );
  }

  @Action(ImportLocalFlagsFile)
  importLocalFlagsFile(
    ctx: StateContext<FlagStoreStateModel>,
    action: ImportLocalFlagsFile,
  ): Observable<unknown> {
    const state = ctx.getState();

    // Check if file already exists
    if (state.files.find((f) => (f.source === 'local-browser' || f.source === 'local-disk') && f.name === action.name)) {
      ctx.patchState({ error: `Flags-file "${action.name}" already exists` });
      return of(void 0);
    }

    const contentString = JSON.stringify(action.content);

    const newFile: FileMetadata = {
      name: action.name,
      source: action.origin === 'disk' ? 'local-disk' : 'local-browser',
    };

    const fileKey = FlagStoreState.getFileKey(newFile);

    ctx.patchState({
      files: [...state.files, newFile],
      filesContent: {
        ...state.filesContent,
        [fileKey]: contentString,
      },
    });

    return ctx.dispatch(new LoadFlagsFiles()).pipe(
      tap(() => {
        ctx.dispatch(
          new Navigate(['/flags-files', 'local', action.name], undefined, {
            queryParamsHandling: 'merge',
          }),
        );
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
    if (!state.currentFileId || !state.currentFileParsed) return;

    const file = state.files.find((f) => FlagStoreState.getFileKey(f) === state.currentFileId);
    if (!file) return;

    // Get current file content and parse it
    const contentString = state.filesContent[state.currentFileId];
    if (!contentString) return;

    try {
      const schema = JSON.parse(contentString);
      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);

      // Update metadata
      abstraction.setMetadata(action.metadata || {});

      // Export and persist
      return this.persistAndParseFile(ctx, state.currentFileId, abstraction, file);
    } catch (err) {
      ctx.patchState({
        error: `Failed to save metadata: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
      console.error('Failed to save metadata', err);
      return of(void 0);
    }
  }

  @Action(UpdateEvaluators)
  updateEvaluators(
    ctx: StateContext<FlagStoreStateModel>,
    action: UpdateEvaluators,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    if (!state.currentFileId || !state.currentFileParsed) return;

    const file = state.files.find((f) => FlagStoreState.getFileKey(f) === state.currentFileId);
    if (!file) return;

    // Get current file content and parse it
    const contentString = state.filesContent[state.currentFileId];
    if (!contentString) return;

    try {
      const schema = JSON.parse(contentString);
      const abstraction = FlagdSchemaAbstraction.fromSchema(schema);

      // Update environments from the action
      if (action.environments) {
        for (const env of action.environments) {
          abstraction.createOrUpdateEnvironment(env);
        }
      }

      // Export and persist
      return this.persistAndParseFile(ctx, state.currentFileId, abstraction, file);
    } catch (err) {
      ctx.patchState({
        error: `Failed to update environments: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
      console.error('Failed to update environments', err);
      return of(void 0);
    }
  }

  private static getFileKey(file: FileMetadata): string {
    if (file.source === 'remote' && file.backendId) {
      return `remote:${file.backendId}:${file.name}`;
    }
    return `${file.source}:${file.name}`;
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
