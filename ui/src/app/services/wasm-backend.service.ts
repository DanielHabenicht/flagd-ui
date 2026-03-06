import { Injectable, signal } from '@angular/core';

export type WasmBackendStatus = 'not-initialized' | 'booting' | 'ready' | 'error';

/**
 * Angular service wrapping the Bootsharp-compiled .NET WASM backend.
 *
 * Call {@link boot} once to initialise the .NET runtime and in-memory database.
 * After the returned promise resolves the bindings are available via
 * {@link initDatabase}, {@link importDatabase}, and {@link exportDatabase}.
 *
 * Usage is NOT yet wired into any component — this service only exposes the API.
 */
@Injectable({ providedIn: 'root' })
export class WasmBackendService {
  /** Current lifecycle status of the WASM backend. */
  readonly status = signal<WasmBackendStatus>('not-initialized');

  /** Human-readable message from the last lifecycle transition. */
  readonly statusMessage = signal<string>('');

  // Lazily loaded bootsharp module (ESM dynamic import)
  private bootsharpModule: typeof import('bootsharp') | null = null;

  /**
   * Boot the .NET WASM runtime.
   * Safe to call multiple times — subsequent calls are no-ops once ready.
   */
  async boot(): Promise<void> {
    if (this.status() === 'ready' || this.status() === 'booting') return;

    this.status.set('booting');
    this.statusMessage.set('Loading .NET WASM runtime…');

    try {
      const bootsharp = await import('bootsharp');
      this.bootsharpModule = bootsharp;

      // Boot the .NET runtime (loads the embedded WASM binaries)
      await bootsharp.default.boot();

      this.status.set('ready');
      this.statusMessage.set('.NET WASM runtime ready.');
    } catch (err) {
      this.status.set('error');
      this.statusMessage.set(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Initialise a fresh in-memory SQLite database inside the WASM runtime.
   * The runtime must be booted first.
   */
  initDatabase(): string {
    this.ensureReady();
    const { OpenFeatureManager } = this.getBindings();
    return OpenFeatureManager.Wasm.WasmBindings.initDatabase();
  }

  /**
   * Import an SQLite database from raw bytes.
   * The runtime must be booted first.
   */
  importDatabase(data: Uint8Array): string {
    this.ensureReady();
    const { OpenFeatureManager } = this.getBindings();
    return OpenFeatureManager.Wasm.WasmBindings.importDatabase(data);
  }

  /**
   * Export the current in-memory SQLite database as raw bytes.
   * The runtime must be booted first.
   */
  exportDatabase(): Uint8Array {
    this.ensureReady();
    const { OpenFeatureManager } = this.getBindings();
    return OpenFeatureManager.Wasm.WasmBindings.exportDatabase();
  }

  private ensureReady(): void {
    if (this.status() !== 'ready') {
      throw new Error('WasmBackendService is not ready. Call boot() first.');
    }
  }

  private getBindings() {
    if (!this.bootsharpModule) {
      throw new Error('Bootsharp module not loaded.');
    }
    return this.bootsharpModule;
  }
}
