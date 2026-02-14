import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideApi } from './api-client/provide-api';
import { routes } from './app.routes';
import { globalLoadingInterceptor } from './interceptors/global-loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([globalLoadingInterceptor])),
    provideNativeDateAdapter(),
    provideApi({ basePath: '' }),
    provideAnimationsAsync(),
  ],
};
