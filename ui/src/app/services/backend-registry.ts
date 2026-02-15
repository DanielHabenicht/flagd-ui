import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngxs/store';
import { BackendInstance } from '../models/flag.models';
import { catchError, map, Observable, of } from 'rxjs';
import { AddBackend, RemoveBackend } from '../state/flag-store.actions';
import { FlagStoreState } from '../state/flag-store.state';

@Injectable({ providedIn: 'root' })
export class BackendRegistry {
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);

  getBackends(): BackendInstance[] {
    return this.store.selectSnapshot(FlagStoreState.backends);
  }

  addBackend(url: string, label?: string): BackendInstance {
    const normalized = url.replace(/\/+$/, '');
    const existing = this.getBackends().find((backend) => backend.url === normalized);
    if (existing) return existing;

    this.store.dispatch(new AddBackend(normalized, label));
    return this.getBackends().find((backend) => backend.url === normalized)!;
  }

  removeBackend(id: string): void {
    this.store.dispatch(new RemoveBackend(id));
  }

  getBackendById(id: string): BackendInstance | undefined {
    return this.getBackends().find((b) => b.id === id);
  }

  /** Probe same-origin backend. Returns true if available. */
  probeDefaultBackend(): Observable<boolean> {
    return this.http.get<{ files: string[] }>('/api/flags').pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
