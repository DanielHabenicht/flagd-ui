import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideStore } from '@ngxs/store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { withNgxsRouterPlugin } from '@ngxs/router-plugin';
import { provideApi } from './api-client/provide-api';
import { routes } from './app.routes';
import { globalLoadingInterceptor } from './interceptors/global-loading.interceptor';
import { FlagStoreState } from './state/current-flag-store.state';
import { UiPreferencesState } from './state/ui-preferences.state';
import { PlaygroundPreferencesState } from './state/playground-preferences.state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([globalLoadingInterceptor])),
    provideNativeDateAdapter(),
    provideApi({ basePath: '' }),
    provideStore(
      [FlagStoreState, UiPreferencesState, PlaygroundPreferencesState],
      withNgxsStoragePlugin({
        keys: [
          'flagStore.localFlagsFiles',
          'flagStore.localFileOrigins',
          'flagStore.backends',
          'uiPreferences.themeMode',
          'playgroundPreferences.servers',
          'playgroundPreferences.drawerHeight',
        ],
      }),
      withNgxsRouterPlugin(),
    ),
    provideAnimationsAsync(),
  ],
};
