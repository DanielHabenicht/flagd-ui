import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideStore } from '@ngxs/store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { withNgxsRouterPlugin } from '@ngxs/router-plugin';
import { provideApi } from './api-client/provide-api';
import { BACKEND_TYPE, DEFAULT_BACKEND_ROOT } from '../environments';
import { routes } from './app.routes';
import { globalLoadingInterceptor } from './interceptors/global-loading.interceptor';
import { FLAG_BACKEND } from './services/flag-backend';
import { RestFlagBackend } from './services/rest-flag-backend';
import { WasmFlagBackend } from './services/wasm-flag-backend';
import { FlagFileStore } from './state/flag-file-store.state';
import { FlagStoreState } from './state/flag-store.state';
import { CurrentFlagStoreState } from './state/current-flag-store.state';
import { UiPreferencesState } from './state/ui-preferences.state';
import { PlaygroundPreferencesState } from './state/playground-preferences.state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([globalLoadingInterceptor])),
    provideNativeDateAdapter(),
    provideApi({ basePath: DEFAULT_BACKEND_ROOT ?? '' }),
    {
      provide: FLAG_BACKEND,
      useExisting: BACKEND_TYPE === 'wasm' ? WasmFlagBackend : RestFlagBackend,
    },
    provideStore(
      [
        FlagFileStore,
        FlagStoreState,
        CurrentFlagStoreState,
        UiPreferencesState,
        PlaygroundPreferencesState,
      ],
      withNgxsStoragePlugin({
        keys: [UiPreferencesState, PlaygroundPreferencesState, FlagFileStore],
      }),
      withNgxsRouterPlugin(),
    ),
    provideAnimationsAsync(),
  ],
};
