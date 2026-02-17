import {
  Environment,
  FlagDefinition,
  FlagState,
  FlagType,
  MetadataMap,
  inferFlagType,
} from '../models/flag.models';

export interface TimeWindowBounds {
  start?: number;
  end?: number;
}

export interface FlagSchemaVariantRow {
  name: string;
  value: unknown;
}

export interface TimeWindowTargetingParseResult {
  global?: TimeWindowBounds;
  perEnvironment: Record<string, TimeWindowBounds>;
}

export interface EditorStateFromJson {
  state: FlagState;
  variants?: FlagSchemaVariantRow[];
  flagType?: FlagType;
  easyType?: 'boolean' | 'string';
  defaultVariant?: string;
  hasDefaultVariant: boolean;
  targeting?: Record<string, unknown>;
  metadata?: MetadataMap;
}

export type AdapterResult<T> = { ok: true; value: T } | { ok: false; error: string };

export class FlagSchemaAdapter {
  private static readonly TIMESTAMP_CONTEXT_VAR = '$flagd.timestamp';

  isValidJson(raw: string): boolean {
    try {
      JSON.parse(raw);
      return true;
    } catch {
      return false;
    }
  }

  formatJson(raw: string): AdapterResult<string> {
    try {
      const parsed = JSON.parse(raw);
      return { ok: true, value: JSON.stringify(parsed, null, 2) };
    } catch {
      return { ok: false, error: 'Cannot format: invalid JSON' };
    }
  }

  serializeFlagDefinition(flag: {
    state: FlagState;
    variants: Record<string, unknown>;
    defaultVariant?: string;
    targeting?: Record<string, unknown>;
    metadata?: MetadataMap;
  }): string {
    const payload: Record<string, unknown> = {
      state: flag.state,
      variants: flag.variants,
    };

    if (flag.defaultVariant) {
      payload['defaultVariant'] = flag.defaultVariant;
    }

    if (flag.targeting && Object.keys(flag.targeting).length > 0) {
      payload['targeting'] = flag.targeting;
    }

    if (flag.metadata && Object.keys(flag.metadata).length > 0) {
      payload['metadata'] = flag.metadata;
    }

    return JSON.stringify(payload, null, 2);
  }

  parseEditorStateFromJson(raw: string): AdapterResult<EditorStateFromJson> {
    const parsedResult = this.parseJsonObject(raw, 'Invalid JSON - fix before switching modes');
    if (!parsedResult.ok) return parsedResult;

    const parsed = parsedResult.value;
    const state: FlagState = parsed['state'] === 'DISABLED' ? 'DISABLED' : 'ENABLED';

    let variants: FlagSchemaVariantRow[] | undefined;
    let flagType: FlagType | undefined;
    let easyType: 'boolean' | 'string' | undefined;

    if (parsed['variants'] && this.isRecord(parsed['variants'])) {
      variants = Object.entries(parsed['variants']).map(([name, value]) => ({ name, value }));
      flagType = inferFlagType(parsed['variants']);
      easyType = flagType === 'boolean' || flagType === 'string' ? flagType : 'boolean';
    }

    return {
      ok: true,
      value: {
        state,
        variants,
        flagType,
        easyType,
        hasDefaultVariant: Object.hasOwn(parsed, 'defaultVariant'),
        defaultVariant: String(parsed['defaultVariant'] ?? ''),
        targeting: this.isRecord(parsed['targeting']) ? parsed['targeting'] : undefined,
        metadata: this.isRecord(parsed['metadata'])
          ? (parsed['metadata'] as MetadataMap)
          : undefined,
      },
    };
  }

  parseFlagForSave(raw: string): AdapterResult<FlagDefinition> {
    const parsedResult = this.parseJsonObject(raw, 'Invalid JSON');
    if (!parsedResult.ok) return parsedResult;

    const parsed = parsedResult.value;

    if (!parsed['state']) {
      return { ok: false, error: 'Missing required field: "state"' };
    }

    if (
      !parsed['variants'] ||
      !this.isRecord(parsed['variants']) ||
      Object.keys(parsed['variants']).length === 0
    ) {
      return { ok: false, error: 'Must have at least one variant' };
    }

    const flag: FlagDefinition = {
      state: parsed['state'] as FlagState,
      variants: parsed['variants'],
    };

    if (parsed['defaultVariant']) {
      flag.defaultVariant = String(parsed['defaultVariant']);
    }

    if (this.isRecord(parsed['targeting']) && Object.keys(parsed['targeting']).length > 0) {
      flag.targeting = parsed['targeting'];
    }

    if (this.isRecord(parsed['metadata'])) {
      flag.metadata = parsed['metadata'] as MetadataMap;
    }

    return { ok: true, value: flag };
  }

  isJsonSaveValid(raw: string): boolean {
    const result = this.parseFlagForSave(raw);
    return result.ok;
  }

  syncJsonState(raw: string, state: FlagState): AdapterResult<string> {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: true, value: raw };
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (!this.isRecord(parsed)) {
        return { ok: true, value: raw };
      }

      parsed['state'] = state;
      return { ok: true, value: JSON.stringify(parsed, null, 2) };
    } catch {
      return { ok: false, error: 'Invalid JSON' };
    }
  }

  buildEasyTimeTargeting(bounds: TimeWindowBounds | null): Record<string, unknown> | undefined {
    const condition = this.buildTimestampConditionFromBounds(bounds);
    if (!condition) return undefined;

    return {
      if: [condition, 'on', 'off'],
    };
  }

  isEasyTimeTargeting(targeting: Record<string, unknown>): boolean {
    return this.parseEasyTimeTargeting(targeting) !== null;
  }

  parseEasyTimeTargeting(targeting: Record<string, unknown> | undefined): TimeWindowBounds | null {
    if (!targeting || Object.keys(targeting).length === 0) return null;

    const ifClause = this.asIfClause(targeting);
    if (!ifClause) return null;

    if (ifClause[1] !== 'on' || ifClause[2] !== 'off') return null;

    const bounds = this.extractTimestampBounds(ifClause[0]);
    if (!bounds) return null;

    return {
      start: bounds.start,
      end: bounds.end,
    };
  }

  buildEnvironmentTimeAwareTargeting(
    environments: Environment[],
    globalBounds: TimeWindowBounds | null,
    perEnvironmentBounds: Record<string, TimeWindowBounds | null>,
  ): Record<string, unknown> {
    if (environments.length === 0) {
      return {};
    }

    const buildChain = (index: number): unknown => {
      if (index >= environments.length) {
        return 'off';
      }

      const env = environments[index];
      const envName = env.name.toLowerCase();
      const envRef = { $ref: `is${env.name.charAt(0).toUpperCase()}${env.name.slice(1)}` };
      const envTimeBounds = perEnvironmentBounds[envName] ?? null;
      const envTimeCondition = this.buildTimestampConditionFromBounds(envTimeBounds);
      const envCondition = envTimeCondition !== null ? { and: [envRef, envTimeCondition] } : envRef;

      return {
        if: [envCondition, envName, buildChain(index + 1)],
      };
    };

    const environmentChain = buildChain(0);
    const globalTimeCondition = this.buildTimestampConditionFromBounds(globalBounds);

    if (globalTimeCondition !== null) {
      return {
        if: [globalTimeCondition, environmentChain, 'off'],
      };
    }

    return (environmentChain as Record<string, unknown>) ?? {};
  }

  parseEnvironmentTimingTargeting(
    targeting: Record<string, unknown> | undefined,
  ): TimeWindowTargetingParseResult {
    const result: TimeWindowTargetingParseResult = {
      perEnvironment: {},
    };

    if (!targeting) return result;

    let cursor: unknown = targeting;
    const maybeIf = this.asIfClause(cursor);
    if (maybeIf) {
      const maybeGlobal = this.extractTimestampBounds(maybeIf[0]);
      if (maybeGlobal && maybeIf[2] === 'off') {
        result.global = maybeGlobal;
        cursor = maybeIf[1];
      }
    }

    this.parseEnvironmentChainTimeWindows(cursor, result.perEnvironment);
    return result;
  }

  /**
   * Detects if a targeting contains a simple time window (easy mode).
   * This is when the targeting is structured as: { if: [timestamp_condition, 'on', 'off'] }
   */
  hasEasyTimeWindow(targeting: Record<string, unknown> | undefined): boolean {
    if (!targeting) return false;
    const bounds = this.parseEasyTimeTargeting(targeting);
    return bounds !== null && (bounds.start !== undefined || bounds.end !== undefined);
  }

  /**
   * Detects if environment-based targeting contains a global time window.
   * Global time windows wrap the entire environment chain: { if: [timestamp_condition, environmentChain, 'off'] }
   */
  hasGlobalTimeWindow(targeting: Record<string, unknown> | undefined): boolean {
    if (!targeting) return false;
    const result = this.parseEnvironmentTimingTargeting(targeting);
    return (
      result.global !== undefined &&
      (result.global.start !== undefined || result.global.end !== undefined)
    );
  }

  /**
   * Detects if targeting contains any time windows (easy, global, or per-environment).
   */
  hasAnyTimeWindow(targeting: Record<string, unknown> | undefined): boolean {
    if (!targeting) return false;
    return (
      this.hasEasyTimeWindow(targeting) ||
      this.hasGlobalTimeWindow(targeting) ||
      this.hasPerEnvironmentTimeWindows(targeting)
    );
  }

  /**
   * Detects if targeting contains any per-environment time windows.
   */
  hasPerEnvironmentTimeWindows(targeting: Record<string, unknown> | undefined): boolean {
    if (!targeting) return false;
    const result = this.parseEnvironmentTimingTargeting(targeting);
    return Object.keys(result.perEnvironment).length > 0;
  }

  private parseJsonObject(
    raw: string,
    invalidJsonError: string,
  ): AdapterResult<Record<string, unknown>> {
    try {
      const parsed = JSON.parse(raw);
      if (!this.isRecord(parsed)) {
        return { ok: false, error: 'JSON must be an object' };
      }
      return { ok: true, value: parsed };
    } catch {
      return { ok: false, error: invalidJsonError };
    }
  }

  private parseEnvironmentChainTimeWindows(
    node: unknown,
    perEnvironment: Record<string, TimeWindowBounds>,
  ): void {
    const ifClause = this.asIfClause(node);
    if (!ifClause) return;

    const parsedCondition = this.extractEnvironmentCondition(ifClause[0]);
    if (parsedCondition?.environmentName) {
      const envName = parsedCondition.environmentName.toLowerCase();
      if (parsedCondition.timeBounds) {
        perEnvironment[envName] = parsedCondition.timeBounds;
      }
    }

    this.parseEnvironmentChainTimeWindows(ifClause[2], perEnvironment);
  }

  private asIfClause(node: unknown): [unknown, unknown, unknown] | null {
    if (!this.isRecord(node)) return null;
    const ifValue = node['if'];
    if (!Array.isArray(ifValue) || ifValue.length < 3) return null;
    return [ifValue[0], ifValue[1], ifValue[2]];
  }

  private extractEnvironmentCondition(
    condition: unknown,
  ): { environmentName?: string; timeBounds?: TimeWindowBounds } | null {
    if (!this.isRecord(condition)) return null;

    if (typeof condition['$ref'] === 'string') {
      return { environmentName: this.environmentNameFromRef(condition['$ref']) };
    }

    if (Array.isArray(condition['and'])) {
      const parts = condition['and'] as unknown[];
      let environmentName: string | undefined;
      let timeBounds: TimeWindowBounds | undefined;

      for (const part of parts) {
        if (this.isRecord(part) && typeof part['$ref'] === 'string') {
          environmentName = this.environmentNameFromRef(part['$ref']);
          continue;
        }

        const parsedTime = this.extractTimestampBounds(part);
        if (parsedTime) {
          timeBounds = parsedTime;
        }
      }

      if (environmentName) {
        return { environmentName, timeBounds };
      }
    }

    return null;
  }

  private environmentNameFromRef(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.startsWith('is') || value.length <= 2) {
      return undefined;
    }

    return value.charAt(2).toLowerCase() + value.slice(3);
  }

  private buildTimestampConditionFromBounds(
    bounds: TimeWindowBounds | null,
  ): Record<string, unknown> | null {
    if (!bounds) return null;

    const conditions: Record<string, unknown>[] = [];
    const varRef = { var: FlagSchemaAdapter.TIMESTAMP_CONTEXT_VAR };

    if (bounds.start !== undefined) {
      conditions.push({ '>=': [varRef, bounds.start] });
    }

    if (bounds.end !== undefined) {
      conditions.push({ '<=': [varRef, bounds.end] });
    }

    if (conditions.length === 0) return null;
    return conditions.length === 1 ? conditions[0] : { and: conditions };
  }

  private extractTimestampBounds(value: unknown): TimeWindowBounds | null {
    if (!this.isRecord(value)) return null;

    if ('>=' in value) {
      const start = this.readTimestampComparison(value['>=']);
      return start !== null ? { start } : null;
    }

    if ('<=' in value) {
      const end = this.readTimestampComparison(value['<=']);
      return end !== null ? { end } : null;
    }

    if ('and' in value) {
      const subConditions = value['and'];
      if (!Array.isArray(subConditions) || subConditions.length === 0) return null;

      let start: number | undefined;
      let end: number | undefined;

      for (const subCondition of subConditions) {
        const parsed = this.extractTimestampBounds(subCondition);
        if (!parsed) return null;
        if (parsed.start !== undefined) start = parsed.start;
        if (parsed.end !== undefined) end = parsed.end;
      }

      if (start === undefined && end === undefined) return null;
      return { start, end };
    }

    return null;
  }

  private readTimestampComparison(value: unknown): number | null {
    if (!Array.isArray(value) || value.length < 2) return null;

    const variableRef = value[0];
    if (!this.isRecord(variableRef)) return null;

    const varName = variableRef['var'];
    if (varName !== FlagSchemaAdapter.TIMESTAMP_CONTEXT_VAR) return null;

    const comparedValue = value[1];
    if (typeof comparedValue === 'number' && Number.isFinite(comparedValue)) {
      return comparedValue;
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
