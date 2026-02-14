export type ThemeMode = 'auto' | 'dark' | 'light';

export class SetThemeMode {
  static readonly type = '[UiPreferences] Set Theme Mode';

  constructor(readonly themeMode: ThemeMode) {}
}