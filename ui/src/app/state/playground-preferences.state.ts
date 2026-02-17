import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { Navigate, RouterNavigation } from '@ngxs/router-plugin';
import { PlaygroundServer } from '../models/playground.models';
import {
  SetPlaygroundDrawerHeight,
  SetPlaygroundServers,
  OpenPlaygroundDrawer,
  ClosePlaygroundDrawer,
  TogglePlaygroundDrawer,
} from './playground-preferences.actions';

export interface PlaygroundPreferencesStateModel {
  servers: PlaygroundServer[];
  drawerHeight: number;
  drawerOpen: boolean;
}

@State<PlaygroundPreferencesStateModel>({
  name: 'playgroundPreferences',
  defaults: {
    servers: [],
    drawerHeight: 280,
    drawerOpen: false,
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

  @Selector()
  static drawerOpen(state: PlaygroundPreferencesStateModel): boolean {
    return state.drawerOpen;
  }

  @Action(RouterNavigation)
  onNavigation(
    ctx: StateContext<PlaygroundPreferencesStateModel>,
    action: RouterNavigation<unknown>,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routerState = action.routerState as any;

    const queryParams = routerState.root?.queryParamMap;
    const shouldBeOpen = queryParams?.get('playground') === 'expanded';
    const currentState = ctx.getState().drawerOpen;
    if (currentState !== shouldBeOpen) {
      ctx.patchState({ drawerOpen: shouldBeOpen });
    }
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

  @Action(OpenPlaygroundDrawer)
  openDrawer(ctx: StateContext<PlaygroundPreferencesStateModel>): void {
    ctx.patchState({ drawerOpen: true });
    ctx.dispatch(new Navigate([], { playground: 'expanded' }, { queryParamsHandling: 'merge' }));
  }

  @Action(ClosePlaygroundDrawer)
  closeDrawer(ctx: StateContext<PlaygroundPreferencesStateModel>): void {
    ctx.patchState({ drawerOpen: false });
    ctx.dispatch(new Navigate([], { playground: null }, { queryParamsHandling: 'merge' }));
  }

  @Action(TogglePlaygroundDrawer)
  toggleDrawer(ctx: StateContext<PlaygroundPreferencesStateModel>): void {
    const currentState = ctx.getState().drawerOpen;
    const newState = !currentState;
    ctx.patchState({ drawerOpen: newState });
    ctx.dispatch(
      new Navigate(
        [],
        { playground: newState ? 'expanded' : null },
        { queryParamsHandling: 'merge' },
      ),
    );
  }
}
