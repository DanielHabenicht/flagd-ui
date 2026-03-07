import { inject, Injectable } from '@angular/core';
import { Action, createSelector, NgxsOnInit, Selector, State, StateContext } from '@ngxs/store';
import { firstValueFrom } from 'rxjs';
import { CollectionsService } from '../api-client/api/collections.service';
import { FlagsService } from '../api-client/api/flags.service';
import { EnvironmentsService } from '../api-client/api/environments.service';
import { TimewindowsService } from '../api-client/api/timewindows.service';
import { SchemaService } from '../api-client/api/schema.service';
import { FlagsCollectionDto } from '../api-client/model/flagsCollectionDto';
import { FlagEntryDto } from '../api-client/model/flagEntryDto';
import { EnvironmentEntryDto } from '../api-client/model/environmentEntryDto';
import { TimeWindowDto } from '../api-client/model/timeWindowDto';
import { RenameCollectionIdParameter } from '../api-client/model/renameCollectionIdParameter';
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
} from './flag-store.actions';

export interface FlagStoreStateModel {
  collections: FlagsCollectionDto[];
  collectionsLoading: boolean;

  selectedCollectionId: RenameCollectionIdParameter | null;

  flags: FlagEntryDto[];
  flagsLoading: boolean;

  environments: EnvironmentEntryDto[];
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
  private readonly collectionsService = inject(CollectionsService);
  private readonly flagsService = inject(FlagsService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly timeWindowsService = inject(TimewindowsService);
  private readonly schemaService = inject(SchemaService);

  ngxsOnInit(ctx: StateContext<FlagStoreStateModel>): void {
    ctx.dispatch(new LoadCollections());
  }

  // ============================================================================
  // SELECTORS
  // ============================================================================

  @Selector()
  static collections(state: FlagStoreStateModel): FlagsCollectionDto[] {
    return state.collections;
  }

  @Selector()
  static collectionsLoading(state: FlagStoreStateModel): boolean {
    return state.collectionsLoading;
  }

  @Selector()
  static selectedCollectionId(state: FlagStoreStateModel): RenameCollectionIdParameter | null {
    return state.selectedCollectionId;
  }

  @Selector()
  static selectedCollection(state: FlagStoreStateModel): FlagsCollectionDto | undefined {
    if (!state.selectedCollectionId) return undefined;
    return state.collections.find((c) => c.id === state.selectedCollectionId);
  }

  @Selector()
  static flags(state: FlagStoreStateModel): FlagEntryDto[] {
    return state.flags;
  }

  @Selector()
  static flagsLoading(state: FlagStoreStateModel): boolean {
    return state.flagsLoading;
  }

  static flagByKey(key: string) {
    return createSelector(
      [FlagStoreState],
      (state: FlagStoreStateModel): FlagEntryDto | undefined =>
        state.flags.find((f) => f.key === key),
    );
  }

  @Selector()
  static environments(state: FlagStoreStateModel): EnvironmentEntryDto[] {
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
      const collections = await firstValueFrom(this.collectionsService.listCollections());
      ctx.patchState({ collections, collectionsLoading: false });
    } catch (e) {
      ctx.patchState({
        collectionsLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load collections',
      });
    }
  }

  @Action(CreateCollection)
  async createCollection(
    ctx: StateContext<FlagStoreStateModel>,
    action: CreateCollection,
  ): Promise<void> {
    ctx.patchState({ error: null });
    try {
      const collection = await firstValueFrom(
        this.collectionsService.createCollection({ name: action.name }),
      );
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
      const updated = await firstValueFrom(
        this.collectionsService.renameCollection(action.id, { name: action.name }),
      );
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
      await firstValueFrom(this.collectionsService.deleteCollection(action.id));
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
      const flags = await firstValueFrom(this.flagsService.getFlags(action.collectionId));
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
      const created = await firstValueFrom(
        this.flagsService.createFlag(action.collectionId, action.flag),
      );
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
      const updated = await firstValueFrom(
        this.flagsService.updateFlag(action.collectionId, action.flag),
      );
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
      await firstValueFrom(this.flagsService.deleteFlag(action.collectionId, action.flagKey));
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
      const environments = await firstValueFrom(
        this.environmentsService.getEnvironments(action.collectionId),
      );
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
      const created = await firstValueFrom(
        this.environmentsService.createEnvironment(action.collectionId, action.environment),
      );
      const state = ctx.getState();
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
      const updated = await firstValueFrom(
        this.environmentsService.updateEnvironment(action.collectionId, action.environment),
      );
      const state = ctx.getState();
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
      await firstValueFrom(
        this.environmentsService.deleteEnvironment(action.collectionId, action.name),
      );
      const state = ctx.getState();
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
      const timeWindows = await firstValueFrom(
        this.timeWindowsService.getTimeWindows(action.collectionId),
      );
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
      const created = await firstValueFrom(
        this.timeWindowsService.createTimeWindow(action.collectionId, action.timeWindow),
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
      const updated = await firstValueFrom(
        this.timeWindowsService.updateTimeWindow(
          action.collectionId,
          action.timeWindowId,
          action.timeWindow,
        ),
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
      await firstValueFrom(
        this.timeWindowsService.deleteTimeWindow(action.collectionId, action.timeWindowId),
      );
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
      const schema = await firstValueFrom(this.schemaService.exportSchema(action.collectionId));
      return schema as Record<string, unknown>;
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
      await firstValueFrom(this.schemaService.importSchema(action.collectionId));
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

    // Metadata is part of the collection - update by renaming with same name to trigger update
    // The collection DTO carries metadata; a rename call preserves it
    // For direct metadata updates, the collection itself would need to be patched
    const updatedCollection: FlagsCollectionDto = {
      ...collection,
      metadata: action.metadata,
    };

    ctx.patchState({
      collections: state.collections.map((c) =>
        c.id === action.collectionId ? updatedCollection : c,
      ),
    });
  }
}
