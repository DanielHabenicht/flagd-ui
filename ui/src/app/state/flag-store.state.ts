import { HostListener, inject, Injectable } from '@angular/core';
import { Action, createSelector, NgxsOnInit, Selector, State, StateContext } from '@ngxs/store';
import {
  CollectionDto,
  EnvironmentDto,
  FLAG_BACKEND,
  FlagBackend,
  FlagDto,
  MetadataDto,
  TimeWindowDto,
} from '../services/flag-backend';
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
} from './flag-store.actions';
import { RouterNavigation } from '@ngxs/router-plugin';

export interface FlagStoreStateModel {
  collections: CollectionDto[];
  collectionsLoading: boolean;

  selectedCollectionId: number | null;

  flags: FlagDto[];
  flagsLoading: boolean;

  environments: EnvironmentDto[];
  environmentsLoading: boolean;

  timeWindows: TimeWindowDto[];
  timeWindowsLoading: boolean;

  error: string | null;
}

@State<FlagStoreStateModel>({
  name: 'flagStore',
  defaults: {
    collections: [],
    collectionsLoading: false,
    selectedCollectionId: null,
    flags: [],
    flagsLoading: false,
    environments: [],
    environmentsLoading: false,
    timeWindows: [],
    timeWindowsLoading: false,
    error: null,
  },
})
@Injectable()
export class FlagStoreState implements NgxsOnInit {
  private readonly backend: FlagBackend = inject(FLAG_BACKEND);

  async ngxsOnInit(ctx: StateContext<FlagStoreStateModel>): Promise<void> {
    if (this.backend.init) {
      await this.backend.init();
    }
    ctx.dispatch(new LoadCollections());
  }

  @Action(RouterNavigation)
  onNavigation(ctx: StateContext<FlagStoreStateModel>, action: RouterNavigation<unknown>): void {
    // this.flushPendingPersist();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routerState = action.routerState as any;
    const params = this.collectRouteParams(routerState?.root);
    // const backendUri = params['uri'] as string | undefined;
    const collectionId = params['collectionId'] as string | undefined;

    if (collectionId) {
      ctx.dispatch(new SelectCollection(parseInt(collectionId, 10)));
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
  static collections(state: FlagStoreStateModel): CollectionDto[] {
    return state.collections;
  }

  @Selector()
  static collectionsLoading(state: FlagStoreStateModel): boolean {
    return state.collectionsLoading;
  }

  @Selector()
  static selectedCollectionId(state: FlagStoreStateModel): number | null {
    return state.selectedCollectionId;
  }

  @Selector()
  static selectedCollection(state: FlagStoreStateModel): CollectionDto | undefined {
    if (!state.selectedCollectionId) return undefined;
    return state.collections.find((c) => c.id === state.selectedCollectionId);
  }

  @Selector()
  static selectedCollectionMetadata(state: FlagStoreStateModel): MetadataDto[] {
    if (!state.selectedCollectionId) return [];
    const collection = state.collections.find((c) => c.id === state.selectedCollectionId);
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
  static error(state: FlagStoreStateModel): string | null {
    return state.error;
  }

  // ============================================================================
  // COLLECTION ACTIONS
  // ============================================================================

  @Action(LoadCollections)
  async loadCollections(ctx: StateContext<FlagStoreStateModel>): Promise<void> {
    ctx.patchState({ collectionsLoading: true, error: null });
    try {
      const collections = await this.backend.listCollections();
      ctx.patchState({ collections, collectionsLoading: false });
    } catch (e) {
      ctx.patchState({
        collectionsLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load collections',
      });
    }
  }

  @Action(SaveDatabase)
  async saveDatabase(ctx: StateContext<FlagStoreStateModel>, action: SaveDatabase): Promise<void> {
    if (this.backend.saveState) {
      try {
        await this.backend.saveState();
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
      const collection = await this.backend.createCollection(action.name);
      const state = ctx.getState();
      ctx.patchState({ collections: [...state.collections, collection] });
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
      const updated = await this.backend.renameCollection(action.id, action.name);
      const state = ctx.getState();
      ctx.patchState({
        collections: state.collections.map((c) => (c.id === action.id ? updated : c)),
      });
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
      await this.backend.deleteCollection(action.id);
      const state = ctx.getState();
      const collections = state.collections.filter((c) => c.id !== action.id);
      const patch: Partial<FlagStoreStateModel> = { collections };

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
      const flags = await this.backend.getFlags(action.collectionId);
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
      const created = await this.backend.createFlag(action.collectionId, action.flag);
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
      const updated = await this.backend.updateFlag(action.collectionId, action.flag);
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
      await this.backend.deleteFlag(action.collectionId, action.flagKey);
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
      const environments = await this.backend.getEnvironments(action.collectionId);
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
      const created = await this.backend.createEnvironment(
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
      const updated = await this.backend.updateEnvironment(
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
      await this.backend.deleteEnvironment(state.selectedCollectionId, action.name);
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
      const timeWindows = await this.backend.getTimeWindows(action.collectionId);
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
      const created = await this.backend.createTimeWindow(action.collectionId, action.timeWindow);
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
      const updated = await this.backend.updateTimeWindow(
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
      await this.backend.deleteTimeWindow(action.collectionId, action.timeWindowId);
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
      return await this.backend.exportSchema(action.collectionId);
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
      await this.backend.importSchema(action.collectionId);
      // Reload all sub-resources after import
      ctx.dispatch([
        new LoadFlags(action.collectionId),
        new LoadEnvironments(action.collectionId),
        new LoadTimeWindows(action.collectionId),
      ]);
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
    const collection = state.collections.find((c) => c.id === action.collectionId);
    if (!collection) {
      ctx.patchState({ error: `Collection not found` });
      return;
    }

    try {
      await this.backend.updateCollectionMetadata(action.collectionId, action.metadata);
      const updatedCollection: CollectionDto = {
        ...collection,
        metadata: action.metadata,
      };

      ctx.patchState({
        collections: state.collections.map((c) =>
          c.id === action.collectionId ? updatedCollection : c,
        ),
      });
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
