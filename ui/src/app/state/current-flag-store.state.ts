import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext, Store } from '@ngxs/store';
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

export interface FlagStoreStateModel {
  // Internal abstraction for the current flag file
  abstraction: FlagdSchemaAbstraction | null;

  // Currently selected file information
  backendType: BackendType | null;
  backendUri: string | null;
  fileName: string | null;
}

@State<FlagStoreStateModel>({
  name: 'currentFlagStore',
  defaults: {
    abstraction: null,
    backendType: null,
    backendUri: null,
    fileName: null,
  },
})
@Injectable()
export class FlagStoreState {
  constructor(private store: Store) {}

  @Selector()
  static flags(state: FlagStoreStateModel): DisplayFlag[] {
    return state.abstraction?.getFlags() || [];
  }

  @Selector()
  static environments(state: FlagStoreStateModel): Environment[] {
    return state.abstraction?.getEnvironments() || [];
  }

  @Selector()
  static metadata(
    state: FlagStoreStateModel,
  ): Record<string, string | number | boolean> | undefined {
    return state.abstraction?.getMetadata();
  }

  @Selector()
  static flagByKey(key: string) {
    return (state: FlagStoreStateModel): DisplayFlag | undefined => {
      return state.abstraction?.getFlagByKey(key);
    };
  }

  @Selector()
  static schema(state: FlagStoreStateModel): Record<string, unknown> | null {
    return state.abstraction?.exportSchema() || null;
  }

  @Selector()
  static backendType(state: FlagStoreStateModel): BackendType | null {
    return state.backendType;
  }

  @Selector()
  static backendUri(state: FlagStoreStateModel): string | null {
    return state.backendUri;
  }

  @Selector()
  static fileName(state: FlagStoreStateModel): string | null {
    return state.fileName;
  }

  @Action(LoadFlagFile)
  loadFlagFile(ctx: StateContext<FlagStoreStateModel>, action: LoadFlagFile): void {
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

    const abstraction = FlagdSchemaAbstraction.fromSchema(file.content as FlagdSchema);
    ctx.patchState({
      abstraction,
      backendType: action.backendType,
      backendUri: action.backendUri,
      fileName: action.fileName,
    });
  }

  @Action(ClearFlagFile)
  clearFlagFile(ctx: StateContext<FlagStoreStateModel>): void {
    ctx.patchState({
      abstraction: null,
      backendType: null,
      backendUri: null,
      fileName: null,
    });
  }

  @Action(CreateOrUpdateFlag)
  createOrUpdateFlag(ctx: StateContext<FlagStoreStateModel>, action: CreateOrUpdateFlag): void {
    const state = ctx.getState();
    if (!state.abstraction) {
      throw new Error('No flag file loaded');
    }

    state.abstraction.createOrUpdateFlag(action.flag, action.previousKey);
    // Trigger state update by creating a new reference
    ctx.patchState({ abstraction: state.abstraction });
  }

  @Action(DeleteFlag)
  deleteFlag(ctx: StateContext<FlagStoreStateModel>, action: DeleteFlag): void {
    const state = ctx.getState();
    if (!state.abstraction) {
      throw new Error('No flag file loaded');
    }

    state.abstraction.deleteFlag(action.flagKey);
    ctx.patchState({ abstraction: state.abstraction });
  }

  @Action(CreateOrUpdateEnvironment)
  createOrUpdateEnvironment(
    ctx: StateContext<FlagStoreStateModel>,
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
  deleteEnvironment(ctx: StateContext<FlagStoreStateModel>, action: DeleteEnvironment): void {
    const state = ctx.getState();
    if (!state.abstraction) {
      throw new Error('No flag file loaded');
    }

    state.abstraction.deleteEnvironment(action.displayName);
    ctx.patchState({ abstraction: state.abstraction });
  }

  @Action(SetMetadata)
  setMetadata(ctx: StateContext<FlagStoreStateModel>, action: SetMetadata): void {
    const state = ctx.getState();
    if (!state.abstraction) {
      throw new Error('No flag file loaded');
    }

    state.abstraction.setMetadata(action.metadata);
    ctx.patchState({ abstraction: state.abstraction });
  }
}
