import { inject, Injectable } from '@angular/core';
import { WasmBackendService } from './wasm-backend.service';
import {
  CollectionDto,
  EnvironmentDto,
  FlagBackend,
  FlagDto,
  GlobalTimeWindowDto,
  MetadataDto,
  PerEnvironmentDefinitionDto,
  TimeWindowDto,
} from './flag-backend';
import type {
  FlagsCollectionDto as WasmCollectionDto,
  FlagEntryDto as WasmFlagDto,
  MetadataEntryDto as WasmMetadataDto,
  EnvironmentEntryDto as WasmEnvironmentDto,
  TimeWindowDto as WasmTimeWindowDto,
  GlobalTimeWindowDto as WasmGlobalTimeWindowDto,
} from './wasm-backend.service';
import { GlobalLoadingService } from './global-loading.service';

type WasmPerEnvDto = import('bootsharp').OpenFeatureManager.Models.PerEnvironmentDefinitionDto;

/**
 * FlagBackend implementation that delegates to the in-browser .NET WASM runtime.
 */
@Injectable({ providedIn: 'root' })
export class WasmFlagBackend implements FlagBackend {
  private readonly wasm = inject(WasmBackendService);
  readonly globalLoading = inject(GlobalLoadingService);

  async init(): Promise<void> {
    this.globalLoading.start();
    await this.wasm.boot();
    await this.wasm.initDatabase();
    this.globalLoading.stop();
  }

  async saveState(): Promise<void> {
    await this.wasm.saveDatabase();
  }

  async exportDatabase(): Promise<Uint8Array | null> {
    return this.wasm.exportDatabaseBytes();
  }

  // ── Collections ────────────────────────────────────────────────────────

  async listCollections(): Promise<CollectionDto[]> {
    return this.wasm.getCollections().map((c) => this.toCollectionDto(c));
  }

  async createCollection(name: string): Promise<CollectionDto> {
    return this.toCollectionDto(this.wasm.createCollection(name));
  }

  async renameCollection(id: string, name: string): Promise<CollectionDto> {
    return this.toCollectionDto(this.wasm.renameCollection(id, name));
  }

  async deleteCollection(id: string): Promise<void> {
    this.wasm.deleteCollection(id);
  }

  // ── Flags ──────────────────────────────────────────────────────────────

  async getFlags(collectionId: string): Promise<FlagDto[]> {
    return this.wasm.getFlags(collectionId).map((f) => this.toFlagDto(f));
  }

  async createFlag(collectionId: string, flag: FlagDto): Promise<FlagDto> {
    return this.toFlagDto(this.wasm.upsertFlag(collectionId, this.toWasmFlag(flag)));
  }

  async updateFlag(collectionId: string, flag: FlagDto): Promise<FlagDto> {
    return this.toFlagDto(this.wasm.upsertFlag(collectionId, this.toWasmFlag(flag)));
  }

  async deleteFlag(collectionId: string, flagKey: string): Promise<void> {
    this.wasm.deleteFlag(collectionId, flagKey);
  }

  // ── Environments ───────────────────────────────────────────────────────

  async getEnvironments(collectionId: string): Promise<EnvironmentDto[]> {
    return this.wasm
      .getEnvironments(collectionId)
      .map((e) => ({ name: e.name, aliases: [...e.aliases] }));
  }

  async createEnvironment(collectionId: string, env: EnvironmentDto): Promise<EnvironmentDto> {
    const e = this.wasm.upsertEnvironment(collectionId, {
      name: env.name,
      aliases: env.aliases,
    } as WasmEnvironmentDto);
    return { name: e.name, aliases: [...e.aliases] };
  }

  async updateEnvironment(collectionId: string, env: EnvironmentDto): Promise<EnvironmentDto> {
    const e = this.wasm.upsertEnvironment(collectionId, {
      name: env.name,
      aliases: env.aliases,
    } as WasmEnvironmentDto);
    return { name: e.name, aliases: [...e.aliases] };
  }

  async deleteEnvironment(collectionId: string, name: string): Promise<void> {
    this.wasm.deleteEnvironment(collectionId, name);
  }

  // ── Time Windows ───────────────────────────────────────────────────────

  async getTimeWindows(collectionId: string): Promise<TimeWindowDto[]> {
    return this.wasm.getTimeWindows(collectionId).map((tw) => this.toTimeWindowDto(tw));
  }

  async createTimeWindow(collectionId: string, tw: TimeWindowDto): Promise<TimeWindowDto> {
    const created = this.wasm.createTimeWindow(collectionId, this.toWasmTimeWindow(tw));
    return this.toTimeWindowDto(created);
  }

  async updateTimeWindow(
    collectionId: string,
    timeWindowId: string,
    tw: TimeWindowDto,
  ): Promise<TimeWindowDto> {
    const updated = this.wasm.updateTimeWindow(
      collectionId,
      timeWindowId,
      this.toWasmTimeWindow(tw),
    );
    return this.toTimeWindowDto(updated);
  }

  async deleteTimeWindow(collectionId: string, timeWindowId: string): Promise<void> {
    this.wasm.deleteTimeWindow(collectionId, timeWindowId);
  }

  // ── Schema ─────────────────────────────────────────────────────────────

  async exportSchema(collectionId: string): Promise<Record<string, unknown>> {
    const json = this.wasm.exportSchema(collectionId);
    return JSON.parse(json) as Record<string, unknown>;
  }

  async importSchema(collectionId: string, schema: string): Promise<void> {
    console.log('Importing schema into WASM backend:', schema);
    this.wasm.importSchema(collectionId, schema);
  }

  // ── Collection Metadata ────────────────────────────────────────────────

  async updateCollectionMetadata(collectionId: string, metadata: MetadataDto[]): Promise<void> {
    this.wasm.updateCollectionMetadata(
      collectionId,
      metadata.map((m) => this.toWasmMetadata(m)),
    );
  }

  // ── Type Mapping Helpers ───────────────────────────────────────────────

  private toCollectionDto(c: WasmCollectionDto): CollectionDto {
    return {
      id: String(c.id),
      name: c.name,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      metadata: c.metadata?.map((m: WasmMetadataDto) => this.toMetadataDto(m)) ?? [],
    };
  }

  private toFlagDto(f: WasmFlagDto): FlagDto {
    return {
      key: f.key,
      type: f.type,
      state: f.state,
      booleanValue: f.booleanValue ?? null,
      stringValue: f.stringValue ?? null,
      numberValue: f.numberValue ?? null,
      objectValue: f.objectValue ?? null,
      metadata: f.metadata?.map((m: WasmMetadataDto) => this.toMetadataDto(m)),
      perEnvironmentDefinitions: f.perEnvironmentDefinitions
        ? this.mapPerEnvDefs(f.perEnvironmentDefinitions as Record<string, WasmPerEnvDto>)
        : undefined,
      globalTimeWindow: f.globalTimeWindow
        ? this.toGlobalTimeWindowDto(f.globalTimeWindow as WasmGlobalTimeWindowDto)
        : undefined,
      previousKey: f.previousKey ?? null,
    };
  }

  private toWasmFlag(flag: FlagDto): WasmFlagDto {
    return {
      key: flag.key,
      type: flag.type,
      state: flag.state,
      booleanValue: flag.booleanValue ?? undefined,
      stringValue: flag.stringValue ?? undefined,
      numberValue: flag.numberValue ?? undefined,
      objectValue: flag.objectValue ?? undefined,
      metadata: flag.metadata?.map((m) => this.toWasmMetadata(m)),
      perEnvironmentDefinitions: flag.perEnvironmentDefinitions
        ? this.mapToWasmPerEnvDefs(flag.perEnvironmentDefinitions)
        : undefined,
      globalTimeWindow: flag.globalTimeWindow
        ? this.toWasmGlobalTimeWindow(flag.globalTimeWindow)
        : undefined,
      previousKey: flag.previousKey ?? undefined,
    } as WasmFlagDto;
  }

  private toMetadataDto(m: WasmMetadataDto): MetadataDto {
    return {
      key: m.key,
      stringValue: m.stringValue ?? null,
      numberValue: m.numberValue ?? null,
      booleanValue: m.booleanValue ?? null,
    };
  }

  private toWasmMetadata(m: MetadataDto): WasmMetadataDto {
    return {
      key: m.key,
      stringValue: m.stringValue ?? undefined,
      numberValue: m.numberValue ?? undefined,
      booleanValue: m.booleanValue ?? undefined,
    } as WasmMetadataDto;
  }

  private toTimeWindowDto(tw: WasmTimeWindowDto): TimeWindowDto {
    return {
      id: String(tw.id),
      name: tw.name,
      startTime: tw.startTime instanceof Date ? tw.startTime.toISOString() : (tw.startTime ?? null),
      endTime: tw.endTime instanceof Date ? tw.endTime.toISOString() : (tw.endTime ?? null),
    };
  }

  private toWasmTimeWindow(tw: TimeWindowDto): WasmTimeWindowDto {
    return {
      id: tw.id,
      name: tw.name,
      startTime: tw.startTime ? new Date(tw.startTime) : undefined,
      endTime: tw.endTime ? new Date(tw.endTime) : undefined,
    } as WasmTimeWindowDto;
  }

  private toGlobalTimeWindowDto(g: WasmGlobalTimeWindowDto): GlobalTimeWindowDto {
    return {
      timeWindowId: String(g.timeWindowId),
      booleanValue: g.booleanValue ?? null,
      stringValue: g.stringValue ?? null,
      numberValue: g.numberValue ?? null,
      objectValue: g.objectValue ?? null,
    };
  }

  private toWasmGlobalTimeWindow(g: GlobalTimeWindowDto): WasmGlobalTimeWindowDto {
    return {
      timeWindowId: g.timeWindowId,
      booleanValue: g.booleanValue ?? undefined,
      stringValue: g.stringValue ?? undefined,
      numberValue: g.numberValue ?? undefined,
      objectValue: g.objectValue ?? undefined,
    } as WasmGlobalTimeWindowDto;
  }

  private mapPerEnvDefs(
    defs: Record<string, WasmPerEnvDto>,
  ): Record<string, PerEnvironmentDefinitionDto> {
    const result: Record<string, PerEnvironmentDefinitionDto> = {};
    for (const [key, def] of Object.entries(defs)) {
      result[key] = {
        booleanValue: def.booleanValue ?? null,
        stringValue: def.stringValue ?? null,
        numberValue: def.numberValue ?? null,
        objectValue: def.objectValue ?? null,
        timeWindowId: def.timeWindowId != null ? String(def.timeWindowId) : null,
      };
    }
    return result;
  }

  private mapToWasmPerEnvDefs(
    defs: Record<string, PerEnvironmentDefinitionDto>,
  ): Record<string, WasmPerEnvDto> {
    const result: Record<string, WasmPerEnvDto> = {};
    for (const [key, def] of Object.entries(defs)) {
      result[key] = {
        booleanValue: def.booleanValue ?? undefined,
        stringValue: def.stringValue ?? undefined,
        numberValue: def.numberValue ?? undefined,
        objectValue: def.objectValue ?? undefined,
        timeWindowId: def.timeWindowId != null ? def.timeWindowId : undefined,
      } as WasmPerEnvDto;
    }
    return result;
  }
}
