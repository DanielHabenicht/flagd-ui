import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext, Store } from '@ngxs/store';
import { RouterNavigation } from '@ngxs/router-plugin';
import { FlagdSchemaAbstraction } from '../models/abstraction/flagd-schema-abstraction';
import { DisplayFlag, Environment } from '../models/abstraction/flagd-abstraction-models';
import { FlagdSchema } from '../models/generated/flagd-schema';
import { BackendType } from './flag-file-store.actions';
import { FlagFile, FlagFileStoreStateModel } from './flag-file-store.state';
import {
  LoadFlagFile,
  ClearFlagFile,
  CreateOrUpdateFlag,
  DeleteFlag,
  CreateOrUpdateEnvironment,
  DeleteEnvironment,
  SetMetadata,
} from './current-flag-store.actions';

export interface CurrentFlagStoreStateModel {
  // Internal abstraction for the current flag file
  abstraction: FlagdSchemaAbstraction | null;

  // Currently selected file information
  backendType: BackendType | null;
  backendUri: string | null;
  fileName: string | null;
}

@State<CurrentFlagStoreStateModel>({
  name: 'currentFlagStore',
  defaults: {
    abstraction: null,
    backendType: null,
    backendUri: null,
    fileName: null,
  },
})
@Injectable()
export class CurrentFlagStoreState {
  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(private store: Store) {}

  @Selector()
  static flags(state: CurrentFlagStoreStateModel): DisplayFlag[] {
    return state.abstraction?.getFlags() || [];
  }

  @Selector()
  static environments(state: CurrentFlagStoreStateModel): Environment[] {
    return state.abstraction?.getEnvironments() || [];
  }

  @Selector()
  static metadata(
    state: CurrentFlagStoreStateModel,
  ): Record<string, string | number | boolean> | undefined {
    return state.abstraction?.getMetadata();
  }

  @Selector()
  static flagByKey(key: string) {
    return (state: CurrentFlagStoreStateModel): DisplayFlag | undefined => {
      return state.abstraction?.getFlagByKey(key);
    };
  }

  @Selector()
  static schema(state: CurrentFlagStoreStateModel): Record<string, unknown> | null {
    return state.abstraction?.exportSchema() || null;
  }

  @Selector()
  static backendType(state: CurrentFlagStoreStateModel): BackendType | null {
    return state.backendType;
  }

  @Selector()
  static backendUri(state: CurrentFlagStoreStateModel): string | null {
    return state.backendUri;
  }

  @Selector()
  static fileName(state: CurrentFlagStoreStateModel): string | null {
    return state.fileName;
  }

  @Action(RouterNavigation)
  onNavigation(
    ctx: StateContext<CurrentFlagStoreStateModel>,
    action: RouterNavigation<unknown>,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routerState = action.routerState as any;
    const params = this.collectRouteParams(routerState?.root);
    const backendType = params['backendType'] as BackendType | undefined;
    const backendUri = params['uri'] as string | undefined;
    const fileName = params['fileName'] as string | undefined;

    const state = ctx.getState();
    if (!backendType || !backendUri || !fileName) {
      if (state.backendType || state.backendUri || state.fileName || state.abstraction) {
        ctx.patchState({
          abstraction: null,
          backendType: null,
          backendUri: null,
          fileName: null,
        });
      }
      return;
    }

    if (
      state.backendType === backendType &&
      state.backendUri === backendUri &&
      state.fileName === fileName
    ) {
      return;
    }

    ctx.dispatch(new LoadFlagFile(backendType, backendUri, fileName));
  }

  @Action(LoadFlagFile)
  loadFlagFile(ctx: StateContext<CurrentFlagStoreStateModel>, action: LoadFlagFile): void {
    // Retrieve file content from flag-file-store
    const file = this.store.selectSnapshot((state: { flagFileStore: FlagFileStoreStateModel }) => {
      const backend = state.flagFileStore?.backends?.[action.backendType]?.[action.backendUri];
      return backend?.files?.find((f: FlagFile) => f.name === action.fileName) || null;
    });

    if (!file) {
      throw new Error(
        `File "${action.fileName}" not found in backend "${action.backendUri}" of type "${action.backendType}"`,
      );
    }

    const abstraction = FlagdSchemaAbstraction.fromSchema(JSON.parse(file.content) as FlagdSchema);
    ctx.patchState({
      abstraction,
      backendType: action.backendType,
      backendUri: action.backendUri,
      fileName: action.fileName,
    });
  }

  @Action(ClearFlagFile)
  clearFlagFile(ctx: StateContext<CurrentFlagStoreStateModel>): void {
    ctx.patchState({
      abstraction: null,
      backendType: null,
      backendUri: null,
      fileName: null,
    });
  }

  @Action(CreateOrUpdateFlag)
  createOrUpdateFlag(
    ctx: StateContext<CurrentFlagStoreStateModel>,
    action: CreateOrUpdateFlag,
  ): void {
    const state = ctx.getState();
    if (!state.abstraction) {
      throw new Error('No flag file loaded');
    }

    state.abstraction.createOrUpdateFlag(action.flag, action.previousKey);
    // Trigger state update by creating a new reference
    ctx.patchState({ abstraction: state.abstraction });
  }

  @Action(DeleteFlag)
  deleteFlag(ctx: StateContext<CurrentFlagStoreStateModel>, action: DeleteFlag): void {
    const state = ctx.getState();
    if (!state.abstraction) {
      throw new Error('No flag file loaded');
    }

    state.abstraction.deleteFlag(action.flagKey);
    ctx.patchState({ abstraction: state.abstraction });
  }

  @Action(CreateOrUpdateEnvironment)
  createOrUpdateEnvironment(
    ctx: StateContext<CurrentFlagStoreStateModel>,
    action: CreateOrUpdateEnvironment,
  ): void {
    const state = ctx.getState();
    if (!state.abstraction) {
      throw new Error('No flag file loaded');
    }

    state.abstraction.createOrUpdateEnvironment(action.environment);
    ctx.patchState({ abstraction: state.abstraction });
  }

  @Action(DeleteEnvironment)
  deleteEnvironment(
    ctx: StateContext<CurrentFlagStoreStateModel>,
    action: DeleteEnvironment,
  ): void {
    const state = ctx.getState();
    if (!state.abstraction) {
      throw new Error('No flag file loaded');
    }

    state.abstraction.deleteEnvironment(action.displayName);
    ctx.patchState({ abstraction: state.abstraction });
  }

  @Action(SetMetadata)
  setMetadata(ctx: StateContext<CurrentFlagStoreStateModel>, action: SetMetadata): void {
    const state = ctx.getState();
    if (!state.abstraction) {
      throw new Error('No flag file loaded');
    }

    state.abstraction.setMetadata(action.metadata);
    ctx.patchState({ abstraction: state.abstraction });
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
}

interface RouteSnapshotLike {
  params?: Record<string, string>;
  children?: RouteSnapshotLike[];
}
