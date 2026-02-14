import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { GlobalLoadingService } from '../services/global-loading.service';

export const globalLoadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(GlobalLoadingService);
  loading.start();

  return next(req).pipe(finalize(() => loading.stop()));
};
