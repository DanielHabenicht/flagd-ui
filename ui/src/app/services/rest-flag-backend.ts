import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CollectionsService } from '../api-client/api/collections.service';
import { FlagsService } from '../api-client/api/flags.service';
import { EnvironmentsService } from '../api-client/api/environments.service';
import { TimewindowsService } from '../api-client/api/timewindows.service';
import { SchemaService } from '../api-client/api/schema.service';
import { FlagsCollectionDto } from '../api-client/model/flagsCollectionDto';
import { FlagEntryDto } from '../api-client/model/flagEntryDto';
import { MetadataEntryDto } from '../api-client/model/metadataEntryDto';
import { GlobalTimeWindowDto as ApiGlobalTimeWindowDto } from '../api-client/model/globalTimeWindowDto';
import { PerEnvironmentDefinitionDto as ApiPerEnvDto } from '../api-client/model/perEnvironmentDefinitionDto';
import { TimeWindowDto as ApiTimeWindowDto } from '../api-client/model/timeWindowDto';
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

/**
 * FlagBackend implementation that delegates to the generated REST API client.
 */
@Injectable({ providedIn: 'root' })
export class RestFlagBackend implements FlagBackend {
  private readonly collections = inject(CollectionsService);
  private readonly flags = inject(FlagsService);
  private readonly environments = inject(EnvironmentsService);
  private readonly timeWindows = inject(TimewindowsService);
  private readonly schema = inject(SchemaService);

  // ── Collections ────────────────────────────────────────────────────────

  async listCollections(): Promise<CollectionDto[]> {
    const list = await firstValueFrom(this.collections.listCollections());
    return list.map((c) => this.toCollectionDto(c));
  }

  async createCollection(name: string): Promise<CollectionDto> {
    const c = await firstValueFrom(this.collections.createCollection({ name }));
    return this.toCollectionDto(c);
  }

  async renameCollection(id: string, name: string): Promise<CollectionDto> {
    const c = await firstValueFrom(this.collections.renameCollection(id, { name }));
    return this.toCollectionDto(c);
  }

  async deleteCollection(id: string): Promise<void> {
    await firstValueFrom(this.collections.deleteCollection(id));
  }

  // ── Flags ──────────────────────────────────────────────────────────────

  async getFlags(collectionId: string): Promise<FlagDto[]> {
    const list = await firstValueFrom(this.flags.getFlags(collectionId));
    return list.map((f) => this.toFlagDto(f));
  }

  async createFlag(collectionId: string, flag: FlagDto): Promise<FlagDto> {
    const f = await firstValueFrom(this.flags.createFlag(collectionId, this.toApiFlagEntry(flag)));
    return this.toFlagDto(f);
  }

  async updateFlag(collectionId: string, flag: FlagDto): Promise<FlagDto> {
    const f = await firstValueFrom(this.flags.updateFlag(collectionId, this.toApiFlagEntry(flag)));
    return this.toFlagDto(f);
  }

  async deleteFlag(collectionId: string, flagKey: string): Promise<void> {
    await firstValueFrom(this.flags.deleteFlag(collectionId, flagKey));
  }

  // ── Environments ───────────────────────────────────────────────────────

  async getEnvironments(collectionId: string): Promise<EnvironmentDto[]> {
    const list = await firstValueFrom(this.environments.getEnvironments(collectionId));
    return list.map((e) => ({ name: e.name, aliases: e.aliases ?? [] }));
  }

  async createEnvironment(collectionId: string, env: EnvironmentDto): Promise<EnvironmentDto> {
    const e = await firstValueFrom(
      this.environments.createEnvironment(collectionId, {
        name: env.name,
        aliases: env.aliases,
      }),
    );
    return { name: e.name, aliases: e.aliases ?? [] };
  }

  async updateEnvironment(collectionId: string, env: EnvironmentDto): Promise<EnvironmentDto> {
    const e = await firstValueFrom(
      this.environments.updateEnvironment(collectionId, {
        name: env.name,
        aliases: env.aliases,
      }),
    );
    return { name: e.name, aliases: e.aliases ?? [] };
  }

  async deleteEnvironment(collectionId: string, name: string): Promise<void> {
    await firstValueFrom(this.environments.deleteEnvironment(collectionId, name));
  }

  // ── Time Windows ───────────────────────────────────────────────────────

  async getTimeWindows(collectionId: string): Promise<TimeWindowDto[]> {
    const list = await firstValueFrom(this.timeWindows.getTimeWindows(collectionId));
    return list.map((tw) => this.toTimeWindowDto(tw));
  }

  async createTimeWindow(collectionId: string, tw: TimeWindowDto): Promise<TimeWindowDto> {
    const created = await firstValueFrom(
      this.timeWindows.createTimeWindow(collectionId, this.toApiTimeWindow(tw)),
    );
    return this.toTimeWindowDto(created);
  }

  async updateTimeWindow(
    collectionId: string,
    timeWindowId: string,
    tw: TimeWindowDto,
  ): Promise<TimeWindowDto> {
    const updated = await firstValueFrom(
      this.timeWindows.updateTimeWindow(collectionId, timeWindowId, this.toApiTimeWindow(tw)),
    );
    return this.toTimeWindowDto(updated);
  }

  async deleteTimeWindow(collectionId: string, timeWindowId: string): Promise<void> {
    await firstValueFrom(this.timeWindows.deleteTimeWindow(collectionId, timeWindowId));
  }

  // ── Schema ─────────────────────────────────────────────────────────────

  async exportSchema(collectionId: string): Promise<Record<string, unknown>> {
    const result = await firstValueFrom(this.schema.exportSchema(collectionId));
    return result as Record<string, unknown>;
  }

  async importSchema(collectionId: string, schema: string): Promise<void> {
    await firstValueFrom(this.schema.importSchema(collectionId, schema));
  }

  // ── Collection Metadata ────────────────────────────────────────────────

  async updateCollectionMetadata(collectionId: string, metadata: MetadataDto[]): Promise<void> {
    const collections = await firstValueFrom(this.collections.listCollections());
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }
    await firstValueFrom(
      this.collections.renameCollection(collection.id, { name: collection.name }),
    );
  }

  // ── Type Mapping Helpers ───────────────────────────────────────────────

  private toCollectionDto(c: FlagsCollectionDto): CollectionDto {
    return {
      id: c.id,
      name: c.name,
      createdAt: c.createdAt,
      metadata: c.metadata?.map((m) => this.toMetadataDto(m)) ?? [],
    };
  }

  private toFlagDto(f: FlagEntryDto): FlagDto {
    return {
      key: f.key,
      type: f.type,
      state: f.state,
      booleanValue: f.booleanValue ?? null,
      stringValue: f.stringValue ?? null,
      numberValue: (f.numberValue as unknown as number) ?? null,
      objectValue: f.objectValue ?? null,
      metadata: f.metadata?.map((m) => this.toMetadataDto(m)),
      perEnvironmentDefinitions: f.perEnvironmentDefinitions
        ? this.mapPerEnvDefs(f.perEnvironmentDefinitions)
        : undefined,
      globalTimeWindow: f.globalTimeWindow
        ? this.toGlobalTimeWindowDto(f.globalTimeWindow)
        : undefined,
      previousKey: f.previousKey ?? null,
    };
  }

  private toApiFlagEntry(flag: FlagDto): FlagEntryDto {
    return {
      key: flag.key,
      type: flag.type,
      state: flag.state,
      booleanValue: flag.booleanValue,
      stringValue: flag.stringValue,
      numberValue: flag.numberValue as unknown as FlagEntryDto['numberValue'],
      objectValue: flag.objectValue,
      metadata: flag.metadata?.map((m) => this.toApiMetadata(m)),
      perEnvironmentDefinitions: flag.perEnvironmentDefinitions
        ? this.mapToApiPerEnvDefs(flag.perEnvironmentDefinitions)
        : undefined,
      globalTimeWindow: flag.globalTimeWindow
        ? this.toApiGlobalTimeWindow(flag.globalTimeWindow)
        : null,
      previousKey: flag.previousKey,
    };
  }

  private toMetadataDto(m: MetadataEntryDto): MetadataDto {
    return {
      key: m.key,
      stringValue: m.stringValue ?? null,
      numberValue: (m.numberValue as unknown as number) ?? null,
      booleanValue: m.booleanValue ?? null,
    };
  }

  private toApiMetadata(m: MetadataDto): MetadataEntryDto {
    return {
      key: m.key,
      stringValue: m.stringValue,
      numberValue: m.numberValue as unknown as MetadataEntryDto['numberValue'],
      booleanValue: m.booleanValue,
    };
  }

  private toTimeWindowDto(tw: ApiTimeWindowDto): TimeWindowDto {
    return {
      id: tw.id,
      name: tw.name,
      startTime: tw.startTime ?? null,
      endTime: tw.endTime ?? null,
    };
  }

  private toApiTimeWindow(tw: TimeWindowDto): ApiTimeWindowDto {
    return {
      id: tw.id,
      name: tw.name,
      startTime: tw.startTime,
      endTime: tw.endTime,
    };
  }

  private toGlobalTimeWindowDto(g: ApiGlobalTimeWindowDto): GlobalTimeWindowDto {
    return {
      timeWindowId: g.timeWindowId,
      booleanValue: g.booleanValue ?? null,
      stringValue: g.stringValue ?? null,
      numberValue: (g.numberValue as unknown as number) ?? null,
      objectValue: g.objectValue ?? null,
    };
  }

  private toApiGlobalTimeWindow(g: GlobalTimeWindowDto): ApiGlobalTimeWindowDto {
    return {
      timeWindowId: g.timeWindowId,
      booleanValue: g.booleanValue,
      stringValue: g.stringValue,
      numberValue: g.numberValue as unknown as ApiGlobalTimeWindowDto['numberValue'],
      objectValue: g.objectValue,
    };
  }

  private mapPerEnvDefs(
    defs: Record<string, ApiPerEnvDto>,
  ): Record<string, PerEnvironmentDefinitionDto> {
    const result: Record<string, PerEnvironmentDefinitionDto> = {};
    for (const [key, def] of Object.entries(defs)) {
      result[key] = {
        booleanValue: def.booleanValue ?? null,
        stringValue: def.stringValue ?? null,
        numberValue: (def.numberValue as unknown as number) ?? null,
        objectValue: def.objectValue ?? null,
        timeWindowId: def.timeWindowId ?? null,
      };
    }
    return result;
  }

  private mapToApiPerEnvDefs(
    defs: Record<string, PerEnvironmentDefinitionDto>,
  ): Record<string, ApiPerEnvDto> {
    const result: Record<string, ApiPerEnvDto> = {};
    for (const [key, def] of Object.entries(defs)) {
      result[key] = {
        booleanValue: def.booleanValue,
        stringValue: def.stringValue,
        numberValue: def.numberValue as unknown as ApiPerEnvDto['numberValue'],
        objectValue: def.objectValue,
        timeWindowId: def.timeWindowId as unknown as ApiPerEnvDto['timeWindowId'],
      };
    }
    return result;
  }
}
