import { HostListener, inject, Injectable } from '@angular/core';
import { Action, createSelector, NgxsOnInit, Selector, State, StateContext } from '@ngxs/store';
import {
  BackendServer,
  CollectionDto,
  EnvironmentDto,
  FlagBackend,
  FlagDto,
  IN_BROWSER_URI,
  MetadataDto,
  THIS_SERVER_URI,
  TimeWindowDto,
} from '../services/flag-backend';
import { RestBackendFactory } from '../services/rest-backend-factory';
import { WasmFlagBackend } from '../services/wasm-flag-backend';
import {
  LoadCollections,
  CreateCollection,
  RenameCollection,
  DeleteCollection,
  SelectCollection,
  LoadFlags,
  CreateFlag,
  UpdateFlag,
  DeleteFlag,
  LoadEnvironments,
  CreateEnvironment,
  UpdateEnvironment,
  DeleteEnvironment,
  LoadTimeWindows,
  CreateTimeWindow,
  UpdateTimeWindow,
  DeleteTimeWindow,
  ExportSchema,
  ImportSchema,
  SetCollectionMetadata,
  SaveDatabase,
  CreateServer,
  SelectServer,
} from './flag-store.actions';
import { Navigate, RouterNavigation } from '@ngxs/router-plugin';

export interface FlagStoreStateModel {
  /**
   * Available backends keyed by route-safe uri (in-browser wasm, this server,
   * and any user-added remotes). Persisted; the auto-detected in-browser/this
   * server entry is refreshed on startup.
   */
  servers: Record<string, BackendServer>;
  selectedServerUri: string | null;

  serverCollections: Record<string, CollectionDto[]>;
  collectionsLoading: boolean;

  selectedCollectionId: string | null;

  flags: FlagDto[];
  flagsLoading: boolean;

  environments: EnvironmentDto[];
  environmentsLoading: boolean;

  timeWindows: TimeWindowDto[];
  timeWindowsLoading: boolean;

  /** Exported flagd schema for the selected collection (used by the playground). */
  selectedSchema: Record<string, unknown> | null;

  error: string | null;
}

@State<FlagStoreStateModel>({
  name: 'flagStore',
  defaults: {
    servers: {},
    selectedServerUri: null,
    serverCollections: {},
    collectionsLoading: false,
    selectedCollectionId: null,
    flags: [],
    flagsLoading: false,
    environments: [],
    environmentsLoading: false,
    timeWindows: [],
    timeWindowsLoading: false,
    selectedSchema: null,
    error: null,
  },
})
@Injectable()
export class FlagStoreState implements NgxsOnInit {
  private readonly restFactory = inject(RestBackendFactory);
  private readonly wasm = inject(WasmFlagBackend);
  private wasmBooted = false;

  /**
   * Resolve the backend for an operation from the selected server uri, per call
   * (no global "active backend"). Each rest server gets its own base-URL-bound
   * client, so different servers can be talked to concurrently.
   */
  private backend(ctx: StateContext<FlagStoreStateModel>): FlagBackend {
    const state = ctx.getState();
    const server = state.selectedServerUri ? state.servers[state.selectedServerUri] : undefined;
    if (server?.kind === 'wasm') return this.wasm;
    return this.restFactory.forBaseUrl(server?.baseUrl || window.location.origin);
  }

  /** A persisted, well-formed user-added remote (guards against stale formats). */
  private isRemoteServer(entry: unknown): entry is BackendServer {
    const s = entry as BackendServer | null;
    return (
      !!s &&
      typeof s === 'object' &&
      typeof s.uri === 'string' &&
      s.uri.startsWith('remote-') &&
      s.kind === 'rest' &&
      typeof s.baseUrl === 'string' &&
      s.baseUrl.length > 0
    );
  }

  async ngxsOnInit(ctx: StateContext<FlagStoreStateModel>): Promise<void> {
    // Keep only well-formed user-added remotes from persisted state (this drops
    // the auto-detected entry and anything left by older persisted formats); the
    // current backend is re-detected below.
    const servers: Record<string, BackendServer> = {};
    for (const entry of Object.values(ctx.getState().servers ?? {})) {
      if (this.isRemoteServer(entry)) {
        servers[entry.uri] = entry;
      }
    }

    // Prefer the server the app is served from; only fall back to the in-browser
    // wasm backend (which is more expensive to boot) when no server is reachable.
    if (await this.isSameOriginServerAvailable()) {
      servers[THIS_SERVER_URI] = {
        uri: THIS_SERVER_URI,
        name: 'This Server',
        kind: 'rest',
        baseUrl: window.location.origin,
      };
    } else {
      servers[IN_BROWSER_URI] = {
        uri: IN_BROWSER_URI,
        name: 'In Browser',
        kind: 'wasm',
        baseUrl: '',
      };
    }

    ctx.patchState({ servers });

    const defaultUri = servers[THIS_SERVER_URI]
      ? THIS_SERVER_URI
      : servers[IN_BROWSER_URI]
        ? IN_BROWSER_URI
        : (Object.keys(servers)[0] ?? null);

    if (defaultUri) {
      ctx.dispatch(new SelectServer(defaultUri));
    }
  }

  private async isSameOriginServerAvailable(): Promise<boolean> {
    try {
      const res = await fetch('/api/collections', { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  @Action(RouterNavigation)
  onNavigation(ctx: StateContext<FlagStoreStateModel>, action: RouterNavigation<unknown>): void {
    // this.flushPendingPersist();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routerState = action.routerState as any;
    const params = this.collectRouteParams(routerState?.root);
    const serverUri = params['uri'] as string | undefined;
    const collectionId = params['collectionId'] as string | undefined;

    const state = ctx.getState();
    // Switch backends when navigating to a collection under a different server
    // (e.g. a bookmarked URL), then select the collection once it is active.
    if (serverUri && serverUri !== state.selectedServerUri && state.servers[serverUri]) {
      ctx.dispatch(new SelectServer(serverUri)).subscribe(() => {
        if (collectionId) ctx.dispatch(new SelectCollection(collectionId));
      });
      return;
    }

    if (collectionId) {
      ctx.dispatch(new SelectCollection(collectionId));
    }
  }

  private collectRouteParams(route: RouteSnapshotLike | null): Record<string, string> {
    if (!route) return {};
    const merged = { ...(route.params ?? {}) };
    const children = route.children ?? [];
    for (const child of children) {
      Object.assign(merged, this.collectRouteParams(child));
    }
    return merged;
  }
  // ============================================================================
  // SELECTORS
  // ============================================================================

  @Selector()
  static selectedServerUri(state: FlagStoreStateModel): string | null {
    return state.selectedServerUri;
  }

  @Selector()
  static collections(state: FlagStoreStateModel): CollectionDto[] {
    if (!state.selectedServerUri) return [];
    return state.serverCollections[state.selectedServerUri] ?? [];
  }

  @Selector()
  static collectionsLoading(state: FlagStoreStateModel): boolean {
    return state.collectionsLoading;
  }

  @Selector()
  static selectedCollectionId(state: FlagStoreStateModel): string | null {
    return state.selectedCollectionId;
  }

  @Selector()
  static selectedSchema(state: FlagStoreStateModel): Record<string, unknown> | null {
    return state.selectedSchema;
  }

  @Selector()
  static selectedCollection(state: FlagStoreStateModel): CollectionDto | undefined {
    if (!state.selectedCollectionId || !state.selectedServerUri) return undefined;
    const collections = state.serverCollections[state.selectedServerUri] ?? [];
    return collections.find((c) => c.id === state.selectedCollectionId);
  }

  @Selector()
  static selectedCollectionMetadata(state: FlagStoreStateModel): MetadataDto[] {
    if (!state.selectedCollectionId || !state.selectedServerUri) return [];
    const collections = state.serverCollections[state.selectedServerUri] ?? [];
    const collection = collections.find((c) => c.id === state.selectedCollectionId);
    return collection ? collection.metadata : [];
  }

  @Selector()
  static flags(state: FlagStoreStateModel): FlagDto[] {
    return state.flags;
  }

  @Selector()
  static flagsLoading(state: FlagStoreStateModel): boolean {
    return state.flagsLoading;
  }

  static flagByKey(key: string) {
    return createSelector([FlagStoreState], (state: FlagStoreStateModel): FlagDto | undefined =>
      state.flags.find((f) => f.key === key),
    );
  }

  @Selector()
  static environments(state: FlagStoreStateModel): EnvironmentDto[] {
    return state.environments;
  }

  @Selector()
  static environmentsLoading(state: FlagStoreStateModel): boolean {
    return state.environmentsLoading;
  }

  @Selector()
  static timeWindows(state: FlagStoreStateModel): TimeWindowDto[] {
    return state.timeWindows;
  }

  @Selector()
  static timeWindowsLoading(state: FlagStoreStateModel): boolean {
    return state.timeWindowsLoading;
  }

  @Selector()
  static servers(state: FlagStoreStateModel): Record<string, BackendServer> {
    return state.servers;
  }

  @Selector()
  static serverEntries(
    state: FlagStoreStateModel,
  ): { name: string; uri: string; collections: CollectionDto[] }[] {
    return Object.values(state.servers).map((server) => ({
      name: server.name,
      uri: server.uri,
      collections: state.serverCollections[server.uri] ?? [],
    }));
  }

  @Selector()
  static error(state: FlagStoreStateModel): string | null {
    return state.error;
  }

  // ============================================================================
  // SERVER ACTIONS
  // ============================================================================

  @Action(CreateServer)
  createServer(ctx: StateContext<FlagStoreStateModel>, action: CreateServer): void {
    const state = ctx.getState();
    const baseUrl = action.url;

    // Reuse an existing remote entry for the same URL instead of duplicating it.
    const existing = Object.values(state.servers).find(
      (s) => s.kind === 'rest' && s.baseUrl === baseUrl && s.uri !== THIS_SERVER_URI,
    );
    const server: BackendServer = existing
      ? { ...existing, name: action.name }
      : {
          uri: `remote-${crypto.randomUUID()}`,
          name: action.name,
          kind: 'rest',
          baseUrl,
        };

    ctx.patchState({ servers: { ...state.servers, [server.uri]: server } });

    ctx.dispatch(new SelectServer(server.uri));
  }

  @Action(SelectServer)
  async selectServer(ctx: StateContext<FlagStoreStateModel>, action: SelectServer): Promise<void> {
    const server = action.uri ? ctx.getState().servers[action.uri] : undefined;

    // The in-browser wasm engine needs a one-time boot; rest servers are
    // resolved per request in backend(), so nothing global is set here.
    if (server?.kind === 'wasm' && !this.wasmBooted) {
      await this.wasm.init?.();
      this.wasmBooted = true;
    }

    ctx.patchState({
      selectedServerUri: action.uri,
      selectedCollectionId: null,
      flags: [],
      flagsLoading: false,
      environments: [],
      environmentsLoading: false,
      timeWindows: [],
      timeWindowsLoading: false,
      selectedSchema: null,
      error: null,
    });

    if (server) {
      ctx.dispatch(new LoadCollections());
    }
  }

  // ============================================================================
  // COLLECTION ACTIONS
  // ============================================================================

  private getServerCollections(state: FlagStoreStateModel): CollectionDto[] {
    if (!state.selectedServerUri) return [];
    return state.serverCollections[state.selectedServerUri] ?? [];
  }

  private patchServerCollections(
    ctx: StateContext<FlagStoreStateModel>,
    collections: CollectionDto[],
  ): void {
    const uri = ctx.getState().selectedServerUri;
    if (!uri) return;
    ctx.patchState({
      serverCollections: { ...ctx.getState().serverCollections, [uri]: collections },
    });
  }

  @Action(LoadCollections)
  async loadCollections(ctx: StateContext<FlagStoreStateModel>): Promise<void> {
    const state = ctx.getState();
    const uri = state.selectedServerUri;
    if (!uri) return;
    ctx.patchState({ collectionsLoading: true, error: null });
    try {
      const collections = await this.backend(ctx).listCollections();
      ctx.patchState({
        serverCollections: { ...ctx.getState().serverCollections, [uri]: collections },
        collectionsLoading: false,
      });
    } catch (e) {
      ctx.patchState({
        collectionsLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load collections',
      });
    }
  }

  @Action(SaveDatabase)
  async saveDatabase(ctx: StateContext<FlagStoreStateModel>, action: SaveDatabase): Promise<void> {
    const backend = this.backend(ctx);
    if (backend.saveState) {
      try {
        await backend.saveState();
      } catch (e) {
        ctx.patchState({ error: e instanceof Error ? e.message : 'Failed to save database' });
      }
    }
  }

  @Action(CreateCollection)
  async createCollection(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateCollection,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const collection = await this.backend(ctx).createCollection(action.name);
      const state = ctx.getState();
      this.patchServerCollections(ctx, [...this.getServerCollections(state), collection]);
      const targetUri = ctx.getState().selectedServerUri;
      if (targetUri) {
        ctx.dispatch(new Navigate(['/', targetUri, collection.id.toString()]));
      }
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to create collection',
      });
    }
  }

  @Action(RenameCollection)
  async renameCollection(
    ctx: StateContext<FlagStoreStateModel>,
    action: RenameCollection,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const updated = await this.backend(ctx).renameCollection(action.id, action.name);
      const state = ctx.getState();
      this.patchServerCollections(
        ctx,
        this.getServerCollections(state).map((c) => (c.id === action.id ? updated : c)),
      );
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to rename collection',
      });
    }
  }

  @Action(DeleteCollection)
  async deleteCollection(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteCollection,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      await this.backend(ctx).deleteCollection(action.id);
      const state = ctx.getState();
      const collections = this.getServerCollections(state).filter((c) => c.id !== action.id);
      this.patchServerCollections(ctx, collections);
      const patch: Partial<FlagStoreStateModel> = {};

      if (state.selectedCollectionId === action.id) {
        patch.selectedCollectionId = null;
        patch.flags = [];
        patch.environments = [];
        patch.timeWindows = [];
      }

      ctx.patchState(patch);
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to delete collection',
      });
    }
  }

  @Action(SelectCollection)
  selectCollection(ctx: StateContext<FlagStoreStateModel>, action: SelectCollection): void {
    const state = ctx.getState();
    if (state.selectedCollectionId === action.id) {
      return;
    }

    ctx.patchState({
      selectedCollectionId: action.id,
      flags: [],
      flagsLoading: false,
      environments: [],
      environmentsLoading: false,
      timeWindows: [],
      timeWindowsLoading: false,
      selectedSchema: null,
      error: null,
    });

    if (action.id) {
      ctx.dispatch([
        new LoadFlags(action.id),
        new LoadEnvironments(action.id),
        new LoadTimeWindows(action.id),
      ]);
    }
  }

  // ============================================================================
  // FLAG ACTIONS
  // ============================================================================

  @Action(LoadFlags)
  async loadFlags(ctx: StateContext<FlagStoreStateModel>, action: LoadFlags): Promise<void> {
    ctx.patchState({ flagsLoading: true, error: null });
    try {
      const flags = await this.backend(ctx).getFlags(action.collectionId);
      ctx.patchState({ flags, flagsLoading: false });
    } catch (e) {
      ctx.patchState({
        flagsLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load flags',
      });
    }
  }

  @Action(CreateFlag)
  async createFlag(ctx: StateContext<FlagStoreStateModel>, action: CreateFlag): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const created = await this.backend(ctx).createFlag(action.collectionId, action.flag);
      const state = ctx.getState();
      ctx.patchState({ flags: [...state.flags, created] });
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to create flag',
      });
    }
  }

  @Action(UpdateFlag)
  async updateFlag(ctx: StateContext<FlagStoreStateModel>, action: UpdateFlag): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const updated = await this.backend(ctx).updateFlag(action.collectionId, action.flag);
      const state = ctx.getState();
      const oldKey = action.flag.previousKey ?? action.flag.key;
      ctx.patchState({
        flags: state.flags.map((f) => (f.key === oldKey ? updated : f)),
      });
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to update flag',
      });
    }
  }

  @Action(DeleteFlag)
  async deleteFlag(ctx: StateContext<FlagStoreStateModel>, action: DeleteFlag): Promise<void> {
    ctx.patchState({ error: null });
    try {
      await this.backend(ctx).deleteFlag(action.collectionId, action.flagKey);
      const state = ctx.getState();
      ctx.patchState({
        flags: state.flags.filter((f) => f.key !== action.flagKey),
      });
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to delete flag',
      });
    }
  }

  // ============================================================================
  // ENVIRONMENT ACTIONS
  // ============================================================================

  @Action(LoadEnvironments)
  async loadEnvironments(
    ctx: StateContext<FlagStoreStateModel>,
    action: LoadEnvironments,
  ): Promise<void> {
    ctx.patchState({ environmentsLoading: true, error: null });
    try {
      const environments = await this.backend(ctx).getEnvironments(action.collectionId);
      ctx.patchState({ environments, environmentsLoading: false });
    } catch (e) {
      ctx.patchState({
        environmentsLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load environments',
      });
    }
  }

  @Action(CreateEnvironment)
  async createEnvironment(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateEnvironment,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const state = ctx.getState();
      if (!state.selectedCollectionId) return;
      const created = await this.backend(ctx).createEnvironment(
        state.selectedCollectionId,
        action.environment,
      );
      ctx.patchState({ environments: [...state.environments, created] });
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to create environment',
      });
    }
  }

  @Action(UpdateEnvironment)
  async updateEnvironment(
    ctx: StateContext<FlagStoreStateModel>,
    action: UpdateEnvironment,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const state = ctx.getState();
      if (!state.selectedCollectionId) return;
      const updated = await this.backend(ctx).updateEnvironment(
        state.selectedCollectionId,
        action.environment,
      );
      ctx.patchState({
        environments: state.environments.map((e) =>
          e.name === action.environment.name ? updated : e,
        ),
      });
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to update environment',
      });
    }
  }

  @Action(DeleteEnvironment)
  async deleteEnvironment(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteEnvironment,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const state = ctx.getState();
      if (!state.selectedCollectionId) return;
      await this.backend(ctx).deleteEnvironment(state.selectedCollectionId, action.name);
      ctx.patchState({
        environments: state.environments.filter((e) => e.name !== action.name),
      });
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to delete environment',
      });
    }
  }

  // ============================================================================
  // TIME WINDOW ACTIONS
  // ============================================================================

  @Action(LoadTimeWindows)
  async loadTimeWindows(
    ctx: StateContext<FlagStoreStateModel>,
    action: LoadTimeWindows,
  ): Promise<void> {
    ctx.patchState({ timeWindowsLoading: true, error: null });
    try {
      const timeWindows = await this.backend(ctx).getTimeWindows(action.collectionId);
      ctx.patchState({ timeWindows, timeWindowsLoading: false });
    } catch (e) {
      ctx.patchState({
        timeWindowsLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load time windows',
      });
    }
  }

  @Action(CreateTimeWindow)
  async createTimeWindow(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateTimeWindow,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const created = await this.backend(ctx).createTimeWindow(
        action.collectionId,
        action.timeWindow,
      );
      const state = ctx.getState();
      ctx.patchState({ timeWindows: [...state.timeWindows, created] });
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to create time window',
      });
    }
  }

  @Action(UpdateTimeWindow)
  async updateTimeWindow(
    ctx: StateContext<FlagStoreStateModel>,
    action: UpdateTimeWindow,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const updated = await this.backend(ctx).updateTimeWindow(
        action.collectionId,
        action.timeWindowId,
        action.timeWindow,
      );
      const state = ctx.getState();
      ctx.patchState({
        timeWindows: state.timeWindows.map((tw) => (tw.id === action.timeWindowId ? updated : tw)),
      });
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to update time window',
      });
    }
  }

  @Action(DeleteTimeWindow)
  async deleteTimeWindow(
    ctx: StateContext<FlagStoreStateModel>,
    action: DeleteTimeWindow,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      await this.backend(ctx).deleteTimeWindow(action.collectionId, action.timeWindowId);
      const state = ctx.getState();
      ctx.patchState({
        timeWindows: state.timeWindows.filter((tw) => tw.id !== action.timeWindowId),
      });
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to delete time window',
      });
    }
  }

  // ============================================================================
  // SCHEMA ACTIONS
  // ============================================================================

  @Action(ExportSchema)
  async exportSchema(
    ctx: StateContext<FlagStoreStateModel>,
    action: ExportSchema,
  ): Promise<Record<string, unknown> | null> {
    ctx.patchState({ error: null });
    try {
      const schema = await this.backend(ctx).exportSchema(action.collectionId);
      if (ctx.getState().selectedCollectionId === action.collectionId) {
        ctx.patchState({ selectedSchema: schema });
      }
      return schema;
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to export schema',
      });
      return null;
    }
  }

  @Action(ImportSchema)
  async importSchema(ctx: StateContext<FlagStoreStateModel>, action: ImportSchema): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const collection = await this.backend(ctx).createCollection(action.newCollectionName);
      const state = ctx.getState();
      this.patchServerCollections(ctx, [...this.getServerCollections(state), collection]);

      await this.backend(ctx).importSchema(collection.id, action.schema);
      // Reload all sub-resources after import
      ctx.dispatch([
        new LoadFlags(collection.id),
        new LoadEnvironments(collection.id),
        new LoadTimeWindows(collection.id),
      ]);
      const targetUri = ctx.getState().selectedServerUri;
      if (targetUri) {
        ctx.dispatch(new Navigate(['/', targetUri, collection.id.toString()]));
      }
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to import schema',
      });
    }
  }

  // ============================================================================
  // COLLECTION METADATA ACTIONS
  // ============================================================================

  @Action(SetCollectionMetadata)
  async setCollectionMetadata(
    ctx: StateContext<FlagStoreStateModel>,
    action: SetCollectionMetadata,
  ): Promise<void> {
    const state = ctx.getState();
    const collections = this.getServerCollections(state);
    const collection = collections.find((c) => c.id === action.collectionId);
    if (!collection) {
      ctx.patchState({ error: `Collection not found` });
      return;
    }

    try {
      await this.backend(ctx).updateCollectionMetadata(action.collectionId, action.metadata);
      const updatedCollection: CollectionDto = {
        ...collection,
        metadata: action.metadata,
      };

      this.patchServerCollections(
        ctx,
        collections.map((c) => (c.id === action.collectionId ? updatedCollection : c)),
      );
    } catch (e) {
      ctx.patchState({
        error: e instanceof Error ? e.message : 'Failed to update collection metadata',
      });
    }
  }
}

interface RouteSnapshotLike {
  params?: Record<string, string>;
  children?: RouteSnapshotLike[];
}
