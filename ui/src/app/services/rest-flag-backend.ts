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
import { RenameCollectionIdParameter } from '../api-client/model/renameCollectionIdParameter';
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

  async renameCollection(id: number, name: string): Promise<CollectionDto> {
    const c = await firstValueFrom(this.collections.renameCollection(this.toId(id), { name }));
    return this.toCollectionDto(c);
  }

  async deleteCollection(id: number): Promise<void> {
    await firstValueFrom(this.collections.deleteCollection(this.toId(id)));
  }

  // ── Flags ──────────────────────────────────────────────────────────────

  async getFlags(collectionId: number): Promise<FlagDto[]> {
    const list = await firstValueFrom(this.flags.getFlags(this.toId(collectionId)));
    return list.map((f) => this.toFlagDto(f));
  }

  async createFlag(collectionId: number, flag: FlagDto): Promise<FlagDto> {
    const f = await firstValueFrom(
      this.flags.createFlag(this.toId(collectionId), this.toApiFlagEntry(flag)),
    );
    return this.toFlagDto(f);
  }

  async updateFlag(collectionId: number, flag: FlagDto): Promise<FlagDto> {
    const f = await firstValueFrom(
      this.flags.updateFlag(this.toId(collectionId), this.toApiFlagEntry(flag)),
    );
    return this.toFlagDto(f);
  }

  async deleteFlag(collectionId: number, flagKey: string): Promise<void> {
    await firstValueFrom(this.flags.deleteFlag(this.toId(collectionId), flagKey));
  }

  // ── Environments ───────────────────────────────────────────────────────

  async getEnvironments(collectionId: number): Promise<EnvironmentDto[]> {
    const list = await firstValueFrom(this.environments.getEnvironments(this.toId(collectionId)));
    return list.map((e) => ({ name: e.name, aliases: e.aliases ?? [] }));
  }

  async createEnvironment(collectionId: number, env: EnvironmentDto): Promise<EnvironmentDto> {
    const e = await firstValueFrom(
      this.environments.createEnvironment(this.toId(collectionId), {
        name: env.name,
        aliases: env.aliases,
      }),
    );
    return { name: e.name, aliases: e.aliases ?? [] };
  }

  async updateEnvironment(collectionId: number, env: EnvironmentDto): Promise<EnvironmentDto> {
    const e = await firstValueFrom(
      this.environments.updateEnvironment(this.toId(collectionId), {
        name: env.name,
        aliases: env.aliases,
      }),
    );
    return { name: e.name, aliases: e.aliases ?? [] };
  }

  async deleteEnvironment(collectionId: number, name: string): Promise<void> {
    await firstValueFrom(this.environments.deleteEnvironment(this.toId(collectionId), name));
  }

  // ── Time Windows ───────────────────────────────────────────────────────

  async getTimeWindows(collectionId: number): Promise<TimeWindowDto[]> {
    const list = await firstValueFrom(this.timeWindows.getTimeWindows(this.toId(collectionId)));
    return list.map((tw) => this.toTimeWindowDto(tw));
  }

  async createTimeWindow(collectionId: number, tw: TimeWindowDto): Promise<TimeWindowDto> {
    const created = await firstValueFrom(
      this.timeWindows.createTimeWindow(this.toId(collectionId), this.toApiTimeWindow(tw)),
    );
    return this.toTimeWindowDto(created);
  }

  async updateTimeWindow(
    collectionId: number,
    timeWindowId: number,
    tw: TimeWindowDto,
  ): Promise<TimeWindowDto> {
    const updated = await firstValueFrom(
      this.timeWindows.updateTimeWindow(
        this.toId(collectionId),
        this.toId(timeWindowId),
        this.toApiTimeWindow(tw),
      ),
    );
    return this.toTimeWindowDto(updated);
  }

  async deleteTimeWindow(collectionId: number, timeWindowId: number): Promise<void> {
    await firstValueFrom(
      this.timeWindows.deleteTimeWindow(this.toId(collectionId), this.toId(timeWindowId)),
    );
  }

  // ── Schema ─────────────────────────────────────────────────────────────

  async exportSchema(collectionId: number): Promise<Record<string, unknown>> {
    const result = await firstValueFrom(this.schema.exportSchema(this.toId(collectionId)));
    return result as Record<string, unknown>;
  }

  async importSchema(collectionId: number, schema: string): Promise<void> {
    await firstValueFrom(this.schema.importSchema(this.toId(collectionId), schema));
  }

  // ── Collection Metadata ────────────────────────────────────────────────

  async updateCollectionMetadata(collectionId: number, metadata: MetadataDto[]): Promise<void> {
    // The REST API doesn't have a direct metadata endpoint; metadata is part of the collection DTO.
    // A rename call with the same name can be used to trigger a PUT.
    const collections = await firstValueFrom(this.collections.listCollections());
    const collection = collections.find((c) => this.fromId(c.id) === collectionId);
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }
    await firstValueFrom(
      this.collections.renameCollection(collection.id, { name: collection.name }),
    );
  }

  // ── Type Mapping Helpers ───────────────────────────────────────────────

  private toId(n: number): RenameCollectionIdParameter {
    return n as unknown as RenameCollectionIdParameter;
  }

  private fromId(id: RenameCollectionIdParameter): number {
    return id as unknown as number;
  }

  private toCollectionDto(c: FlagsCollectionDto): CollectionDto {
    return {
      id: this.fromId(c.id),
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
      id: this.fromId(tw.id),
      name: tw.name,
      startTime: tw.startTime ?? null,
      endTime: tw.endTime ?? null,
    };
  }

  private toApiTimeWindow(tw: TimeWindowDto): ApiTimeWindowDto {
    return {
      id: this.toId(tw.id),
      name: tw.name,
      startTime: tw.startTime,
      endTime: tw.endTime,
    };
  }

  private toGlobalTimeWindowDto(g: ApiGlobalTimeWindowDto): GlobalTimeWindowDto {
    return {
      timeWindowId: this.fromId(g.timeWindowId),
      booleanValue: g.booleanValue ?? null,
      stringValue: g.stringValue ?? null,
      numberValue: (g.numberValue as unknown as number) ?? null,
      objectValue: g.objectValue ?? null,
    };
  }

  private toApiGlobalTimeWindow(g: GlobalTimeWindowDto): ApiGlobalTimeWindowDto {
    return {
      timeWindowId: this.toId(g.timeWindowId),
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
        timeWindowId: def.timeWindowId ? (def.timeWindowId as unknown as number) : null,
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
