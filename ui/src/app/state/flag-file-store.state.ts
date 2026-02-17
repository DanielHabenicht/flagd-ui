import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Action, createSelector, NgxsOnInit, Selector, State, StateContext } from '@ngxs/store';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_BACKEND_ROOT } from '../../environments';
import { FlagsService } from '../api-client/api/flags.service';
import { FileSystemAccess } from '../services/file-system-access';
import {
  AddBackend,
  RemoveBackend,
  AddFile,
  RemoveFile,
  UpdateFileContent,
  BackendType,
  SyncBackends,
} from './flag-file-store.actions';

/**
 * Represents a flag file in a backend.
 */
export interface FlagFile {
  name: string;
  content: string;
}

/**
 * Represents a backend connection.
 * Local storage (both browser and disk) use hardcoded IDs 'local-browser' and 'local-disk'.
 * Remote backends have URL-based IDs.
 */
export interface Backend {
  uri: string; // 'local-browser', 'local-disk', or URL-based id for remote
  label: string; // Display label
  files: FlagFile[]; // Files in this backend
}

export interface FlagFileStoreStateModel {
  // Double map: storage type ('local' or 'remote') -> id -> backend
  backends: Record<'local' | 'remote', Record<string, Backend>>;
}

export const LocalBackendUris = {
  Browser: 'browser',
  Disk: 'disk',
};

@State<FlagFileStoreStateModel>({
  name: 'flagFileStore',
  defaults: {
    backends: {
      local: {
        [LocalBackendUris.Browser]: {
          uri: LocalBackendUris.Browser,
          label: 'Local Files (Browser)',
          files: [],
        },
        [LocalBackendUris.Disk]: {
          uri: LocalBackendUris.Disk,
          label: 'Local Files (Disk)',
          files: [],
        },
      },
      remote: {},
    },
  },
})
@Injectable()
export class FlagFileStore implements NgxsOnInit {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly fileSystemAccess: FileSystemAccess,
  ) {}

  ngxsOnInit(ctx: StateContext<FlagFileStoreStateModel>): void {
    if (DEFAULT_BACKEND_ROOT === null || DEFAULT_BACKEND_ROOT === undefined) {
      return;
    }

    const defaultRoot = DEFAULT_BACKEND_ROOT;

    const normalized = this.normalizeUrl(defaultRoot);
    const state = ctx.getState();
    const remoteBackends = state?.backends?.remote ?? {};
    if (remoteBackends[normalized]) {
      ctx.dispatch(new SyncBackends('remote', normalized));
      return;
    }

    ctx.patchState({
      backends: {
        ...state.backends,
        remote: {
          ...remoteBackends,
          [normalized]: {
            uri: normalized,
            label: defaultRoot,
            files: [],
          },
        },
      },
    });

    ctx.dispatch(new SyncBackends('remote', normalized));
  }

  @Selector()
  static backends(state: FlagFileStoreStateModel): Backend[] {
    if (!state?.backends) {
      return [];
    }
    const backends: Backend[] = [];
    for (const typeMap of Object.values(state.backends)) {
      backends.push(...Object.values(typeMap));
    }
    return backends;
  }

  @Selector()
  static backendsMap(
    state: FlagFileStoreStateModel,
  ): Record<'local' | 'remote', Record<string, Backend>> {
    return state?.backends ?? { local: {}, remote: {} };
  }

  static backendsByType(backendType: BackendType) {
    return createSelector([FlagFileStore], (state: FlagFileStoreStateModel): Backend[] => {
      return Object.values(state?.backends?.[backendType] || {});
    });
  }

  static backend() {
    return (backendType: BackendType, uri: string) =>
      createSelector(
        [FlagFileStore],
        (state: FlagFileStoreStateModel): Backend | undefined =>
          state?.backends?.[backendType]?.[uri],
      );
  }

  @Action(AddBackend)
  addBackend(ctx: StateContext<FlagFileStoreStateModel>, action: AddBackend): void {
    const state = ctx.getState();
    const normalized = this.normalizeUrl(action.uri);

    // Check if backend already exists
    const existing = Object.values(state.backends.remote).find(
      (backend) => backend.uri === normalized,
    );
    if (existing) {
      throw new Error('Backend already exists');
    }

    const backend: Backend = {
      uri: normalized,
      label: action.label,
      files: [],
    };

    ctx.patchState({
      backends: {
        ...state.backends,
        remote: {
          ...state.backends.remote,
          [normalized]: backend,
        },
      },
    });
  }

  @Action(RemoveBackend)
  removeBackend(ctx: StateContext<FlagFileStoreStateModel>, action: RemoveBackend): void {
    // Cannot remove local backends
    if (action.backendType === 'local') {
      throw new Error('Cannot remove local backends');
    }

    const state = ctx.getState();
    const uriMap = state.backends[action.backendType];
    if (!uriMap || !uriMap[action.uri]) {
      throw new Error(`Backend "${action.uri}" not found`);
    }

    const nextTypeMap = { ...uriMap };
    delete nextTypeMap[action.uri];

    ctx.patchState({
      backends: {
        ...state.backends,
        [action.backendType]: nextTypeMap,
      },
    });
  }

  @Action(AddFile)
  addFile(ctx: StateContext<FlagFileStoreStateModel>, action: AddFile): void {
    const state = ctx.getState();
    const uriMap = state.backends[action.backendType];
    const backend = uriMap?.[action.uri];

    if (!backend) {
      throw new Error(`Backend "${action.uri}" of type "${action.backendType}" not found`);
    }

    // Check if file already exists in this backend
    if (backend.files.some((f) => f.name === action.fileName)) {
      throw new Error(`File "${action.fileName}" already exists in this backend`);
    }

    const updatedBackend: Backend = {
      ...backend,
      files: [...backend.files, { name: action.fileName, content: action.content }],
    };

    ctx.patchState({
      backends: {
        ...state.backends,
        [action.backendType]: {
          ...uriMap,
          [action.uri]: updatedBackend,
        },
      },
    });
  }

  @Action(RemoveFile)
  removeFile(ctx: StateContext<FlagFileStoreStateModel>, action: RemoveFile): void {
    const state = ctx.getState();
    const uriMap = state.backends[action.backendType];
    const backend = uriMap?.[action.uri];

    if (!backend) {
      throw new Error(`Backend "${action.uri}" of type "${action.backendType}" not found`);
    }

    const updatedBackend: Backend = {
      ...backend,
      files: backend.files.filter((f) => f.name !== action.fileName),
    };

    ctx.patchState({
      backends: {
        ...state.backends,
        [action.backendType]: {
          ...uriMap,
          [action.uri]: updatedBackend,
        },
      },
    });
  }

  @Action(UpdateFileContent)
  updateFileContent(ctx: StateContext<FlagFileStoreStateModel>, action: UpdateFileContent): void {
    const state = ctx.getState();
    const uriMap = state.backends[action.backendType];
    const backend = uriMap?.[action.uri];

    if (!backend) {
      throw new Error(`Backend "${action.uri}" of type "${action.backendType}" not found`);
    }

    const fileIndex = backend.files.findIndex((f) => f.name === action.fileName);
    if (fileIndex === -1) {
      throw new Error(`File "${action.fileName}" not found in backend "${action.uri}"`);
    }

    const updatedFiles = [...backend.files];
    updatedFiles[fileIndex] = { ...updatedFiles[fileIndex], content: action.content };

    const updatedBackend: Backend = {
      ...backend,
      files: updatedFiles,
    };

    ctx.patchState({
      backends: {
        ...state.backends,
        [action.backendType]: {
          ...uriMap,
          [action.uri]: updatedBackend,
        },
      },
    });
  }

  @Action(SyncBackends)
  async syncBackends(
    ctx: StateContext<FlagFileStoreStateModel>,
    action: SyncBackends,
  ): Promise<void> {
    const state = ctx.getState();

    const backend = state.backends[action.backendType]?.[action.uri];
    if (!backend) {
      return;
    }

    if (action.backendType === 'remote') {
      await this.importRemoteBackend(ctx, backend);
      return;
    }

    if (action.backendType === 'local' && action.uri === LocalBackendUris.Disk) {
      await this.importDiskBackend(ctx);
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================
  private async importRemoteBackend(
    ctx: StateContext<FlagFileStoreStateModel>,
    backend: Backend,
  ): Promise<void> {
    const api = new FlagsService(this.httpClient, backend.uri);

    try {
      const listResponse = await firstValueFrom(api.listFlags());
      const files = listResponse?.files ?? [];
      if (!files.length) {
        return;
      }

      const imported = await Promise.all(
        files.map(async (name) => {
          const content = await firstValueFrom(api.getFlag(name));
          return { name, content: JSON.stringify(content, null, 2) };
        }),
      );

      this.upsertBackendFiles(ctx, 'remote', backend.uri, imported);
    } catch {
      return;
    }
  }

  private async importDiskBackend(ctx: StateContext<FlagFileStoreStateModel>): Promise<void> {
    const bound = await this.fileSystemAccess.readBoundFlagsFiles();
    if (!bound.length) {
      return;
    }

    const imported = bound.map((entry) => ({
      name: entry.name,
      content: JSON.stringify(entry.content, null, 2),
    }));

    this.upsertBackendFiles(ctx, 'local', LocalBackendUris.Disk, imported);
  }

  private upsertBackendFiles(
    ctx: StateContext<FlagFileStoreStateModel>,
    backendType: BackendType,
    uri: string,
    imported: Array<{ name: string; content: string }>,
  ): void {
    const state = ctx.getState();
    const uriMap = state.backends[backendType];
    const backend = uriMap?.[uri];
    if (!backend) {
      return;
    }

    const incomingMap = new Map(imported.map((entry) => [entry.name, entry.content]));
    const updatedFiles = backend.files.map((file) => {
      const incoming = incomingMap.get(file.name);
      if (!incoming) {
        return file;
      }
      incomingMap.delete(file.name);
      return { name: file.name, content: incoming };
    });

    for (const [name, content] of incomingMap.entries()) {
      updatedFiles.push({ name, content });
    }

    ctx.patchState({
      backends: {
        ...state.backends,
        [backendType]: {
          ...uriMap,
          [uri]: {
            ...backend,
            files: updatedFiles,
          },
        },
      },
    });
  }

  private normalizeUrl(url: string): string {
    // Remove trailing slashes and normalize the URL
    return url.replace(/\/$/, '').toLowerCase();
  }
}
