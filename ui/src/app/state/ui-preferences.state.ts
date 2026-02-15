import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { SetThemeMode, ThemeMode } from './ui-preferences.actions';

export interface UiPreferencesStateModel {
  themeMode: ThemeMode;
}

@State<UiPreferencesStateModel>({
  name: 'uiPreferences',
  defaults: {
    themeMode: 'auto',
  },
})
@Injectable()
export class UiPreferencesState {
  @Selector()
  static themeMode(state: UiPreferencesStateModel): ThemeMode {
    return state.themeMode;
  }

  @Action(SetThemeMode)
  setThemeMode(ctx: StateContext<UiPreferencesStateModel>, action: SetThemeMode): void {
    ctx.patchState({ themeMode: action.themeMode });
  }
}
