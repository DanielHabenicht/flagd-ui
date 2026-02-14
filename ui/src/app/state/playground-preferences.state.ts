import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { PlaygroundServer } from '../models/playground.models';
import {
  SetPlaygroundDrawerHeight,
  SetPlaygroundServers,
} from './playground-preferences.actions';

export interface PlaygroundPreferencesStateModel {
  servers: PlaygroundServer[];
  drawerHeight: number;
}

@State<PlaygroundPreferencesStateModel>({
  name: 'playgroundPreferences',
  defaults: {
    servers: [],
    drawerHeight: 280,
  },
})
@Injectable()
export class PlaygroundPreferencesState {
  @Selector()
  static servers(state: PlaygroundPreferencesStateModel): PlaygroundServer[] {
    return state.servers;
  }

  @Selector()
  static drawerHeight(state: PlaygroundPreferencesStateModel): number {
    return state.drawerHeight;
  }

  @Action(SetPlaygroundServers)
  setServers(
    ctx: StateContext<PlaygroundPreferencesStateModel>,
    action: SetPlaygroundServers,
  ): void {
    ctx.patchState({ servers: action.servers });
  }

  @Action(SetPlaygroundDrawerHeight)
  setDrawerHeight(
    ctx: StateContext<PlaygroundPreferencesStateModel>,
    action: SetPlaygroundDrawerHeight,
  ): void {
    ctx.patchState({ drawerHeight: action.drawerHeight });
  }
}