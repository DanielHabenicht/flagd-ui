import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BackendInstance } from '../models/flag.models';
import { catchError, map, Observable, of } from 'rxjs';

const STORAGE_KEY = 'flagd-ui-backends';

@Injectable({ providedIn: 'root' })
export class BackendRegistry {
  private readonly http = inject(HttpClient);

  getBackends(): BackendInstance[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  saveBackends(backends: BackendInstance[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(backends));
  }

  addBackend(url: string, label?: string): BackendInstance {
    const backends = this.getBackends();
    const normalized = url.replace(/\/+$/, '');
    const existing = backends.find((b) => b.url === normalized);
    if (existing) return existing;

    const instance: BackendInstance = {
      id: crypto.randomUUID().slice(0, 8),
      url: normalized,
      label: label || new URL(normalized).host,
    };
    backends.push(instance);
    this.saveBackends(backends);
    return instance;
  }

  removeBackend(id: string): void {
    const backends = this.getBackends().filter((b) => b.id !== id);
    this.saveBackends(backends);
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
