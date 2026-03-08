import { Injectable, signal } from '@angular/core';

// Re-export generated DTO types from bootsharp for consumers
export type { OpenFeatureManager as OpenFeatureManagerTypes } from 'bootsharp';

export type FlagsCollectionDto = import('bootsharp').OpenFeatureManager.Models.FlagsCollectionDto;
export type MetadataEntryDto = import('bootsharp').OpenFeatureManager.Models.MetadataEntryDto;
export type FlagEntryDto = import('bootsharp').OpenFeatureManager.Models.FlagEntryDto;
export type GlobalTimeWindowDto = import('bootsharp').OpenFeatureManager.Models.GlobalTimeWindowDto;
export type EnvironmentEntryDto = import('bootsharp').OpenFeatureManager.Models.EnvironmentEntryDto;
export type TimeWindowDto = import('bootsharp').OpenFeatureManager.Models.TimeWindowDto;

export type WasmBackendStatus = 'not-initialized' | 'booting' | 'ready' | 'error';

/**
 * Angular service wrapping the Bootsharp-compiled .NET WASM backend.
 *
 * Call {@link boot} once to initialise the .NET runtime and in-memory database.
 * After the returned promise resolves, all database lifecycle and flagd domain
 * operations are available.
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

  // ─── Database lifecycle ───────────────────────────────────────────────

  initDatabase(): string {
    return this.db().initDatabase();
  }

  importDatabase(data: Uint8Array): string {
    return this.db().importDatabase(data);
  }

  exportDatabase(): Uint8Array {
    return this.db().exportDatabase();
  }

  // ─── Collections ──────────────────────────────────────────────────────

  getCollections(): FlagsCollectionDto[] {
    return this.flagd().getCollections();
  }

  getCollection(id: bigint): FlagsCollectionDto {
    return this.flagd().getCollection(id);
  }

  createCollection(name: string): FlagsCollectionDto {
    return this.flagd().createCollection(name);
  }

  renameCollection(id: bigint, name: string): FlagsCollectionDto {
    return this.flagd().renameCollection(id, name);
  }

  deleteCollection(id: bigint): void {
    this.flagd().deleteCollection(id);
  }

  clearCollectionData(collectionId: bigint): void {
    this.flagd().clearCollectionData(collectionId);
  }

  updateCollectionMetadata(collectionId: bigint, metadata: MetadataEntryDto[]): void {
    this.flagd().updateCollectionMetadata(collectionId, metadata);
  }

  // ─── Flags ────────────────────────────────────────────────────────────

  getFlags(collectionId: bigint): FlagEntryDto[] {
    return this.flagd().getFlags(collectionId);
  }

  upsertFlag(collectionId: bigint, dto: FlagEntryDto): FlagEntryDto {
    return this.flagd().upsertFlag(collectionId, dto);
  }

  deleteFlag(collectionId: bigint, flagKey: string): void {
    this.flagd().deleteFlag(collectionId, flagKey);
  }

  // ─── Environments ─────────────────────────────────────────────────────

  getEnvironments(collectionId: bigint): EnvironmentEntryDto[] {
    return this.flagd().getEnvironments(collectionId);
  }

  upsertEnvironment(collectionId: bigint, dto: EnvironmentEntryDto): EnvironmentEntryDto {
    return this.flagd().upsertEnvironment(collectionId, dto);
  }

  deleteEnvironment(collectionId: bigint, name: string): void {
    this.flagd().deleteEnvironment(collectionId, name);
  }

  // ─── Time Windows ─────────────────────────────────────────────────────

  getTimeWindows(collectionId: bigint): TimeWindowDto[] {
    return this.flagd().getTimeWindows(collectionId);
  }

  createTimeWindow(collectionId: bigint, dto: TimeWindowDto): TimeWindowDto {
    return this.flagd().createTimeWindow(collectionId, dto);
  }

  updateTimeWindow(collectionId: bigint, timeWindowId: bigint, dto: TimeWindowDto): TimeWindowDto {
    return this.flagd().updateTimeWindow(collectionId, timeWindowId, dto);
  }

  deleteTimeWindow(collectionId: bigint, timeWindowId: bigint): void {
    this.flagd().deleteTimeWindow(collectionId, timeWindowId);
  }

  // ─── Schema ───────────────────────────────────────────────────────────

  exportSchema(collectionId: bigint): string {
    return this.flagd().exportSchema(collectionId);
  }

  importSchema(collectionId: bigint, schemaJson: string): void {
    this.flagd().importSchema(collectionId, schemaJson);
  }

  // ─── Private helpers ──────────────────────────────────────────────────

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

  private db() {
    this.ensureReady();
    return this.getBindings().OpenFeatureManager.Wasm.DatabaseWasmService;
  }

  private flagd() {
    this.ensureReady();
    return this.getBindings().OpenFeatureManager.Wasm.FlagdWasmService;
  }
}
