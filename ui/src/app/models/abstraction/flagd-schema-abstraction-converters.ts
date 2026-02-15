import { FlagType } from './flagd-abstraction-models';
import { JSONLOGIC_IN_OPERATOR, JSONLOGIC_VAR_PROPERTY } from './flagd-constants';

/**
 * Converts per-environment definitions (with time windows) into JsonLogic targeting
 */
export class TimeWindowExporter {
  private static readonly ENVIRONMENT_VAR_NAME = 'environment';
  private static readonly TIMESTAMP_CONTEXT_VAR = '$flagd.timestamp';

  static buildTargetingFromTimeWindows(
    perEnvDefs: Record<string, any>,
  ): Record<string, unknown> | null {
    const envTimeWindows: Record<string, { start?: number; end?: number } | null> = {};

    for (const [envName, def] of Object.entries(perEnvDefs)) {
      if (def.timeWindow) {
        const bounds: { start?: number; end?: number } = {};
        if (def.timeWindow.startTime !== undefined) {
          bounds.start = def.timeWindow.startTime;
        }
        if (def.timeWindow.endTime !== undefined) {
          bounds.end = def.timeWindow.endTime;
        }
        if (bounds.start !== undefined || bounds.end !== undefined) {
          envTimeWindows[envName.toLowerCase()] = bounds;
        }
      }
    }

    if (Object.keys(envTimeWindows).length === 0) {
      return null;
    }

    // Build environment chain with time windows
    let chain: Record<string, unknown> | null = null;
    for (const [envName, bounds] of Object.entries(envTimeWindows)) {
      const condition = {
        [JSONLOGIC_IN_OPERATOR]: [
          { [JSONLOGIC_VAR_PROPERTY]: TimeWindowExporter.ENVIRONMENT_VAR_NAME },
          [envName],
        ],
      };

      let nextCondition: Record<string, unknown> = condition;
      if (bounds && (bounds.start !== undefined || bounds.end !== undefined)) {
        const timeCondition = TimeWindowExporter.buildTimestampCondition(bounds);
        if (timeCondition) {
          nextCondition = { and: [condition, timeCondition] };
        }
      }

      if (chain === null) {
        chain = { if: [nextCondition, 'on', 'off'] };
      } else {
        chain = { if: [nextCondition, 'on', chain] };
      }
    }

    return chain;
  }

  private static buildTimestampCondition(bounds: {
    start?: number;
    end?: number;
  }): Record<string, unknown> | null {
    const conditions: Record<string, unknown>[] = [];

    if (bounds.start !== undefined) {
      conditions.push({
        '>=': [
          { [JSONLOGIC_VAR_PROPERTY]: TimeWindowExporter.TIMESTAMP_CONTEXT_VAR },
          bounds.start,
        ],
      });
    }

    if (bounds.end !== undefined) {
      conditions.push({
        '<=': [{ [JSONLOGIC_VAR_PROPERTY]: TimeWindowExporter.TIMESTAMP_CONTEXT_VAR }, bounds.end],
      });
    }

    if (conditions.length === 0) {
      return null;
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return { and: conditions };
  }
}

/**
 * Parses JsonLogic targeting to extract time windows and environment information
 */
export class TimeWindowImporter {
  private static readonly ENVIRONMENT_VAR_NAME = 'environment';
  private static readonly TIMESTAMP_CONTEXT_VAR = '$flagd.timestamp';

  static parseEnvironmentTimingTargeting(targeting: Record<string, unknown>): {
    global?: { start?: number; end?: number };
    perEnvironment: Record<string, { start?: number; end?: number }>;
  } {
    const result: {
      global?: { start?: number; end?: number };
      perEnvironment: Record<string, { start?: number; end?: number }>;
    } = {
      perEnvironment: {},
    };

    if (!targeting) return result;

    let cursor: unknown = targeting;
    const maybeIf = TimeWindowImporter.asIfClause(cursor);
    if (maybeIf) {
      const maybeGlobal = TimeWindowImporter.extractTimestampBounds(maybeIf[0]);
      if (maybeGlobal && maybeIf[2] === 'off') {
        result.global = maybeGlobal;
        cursor = maybeIf[1];
      }
    }

    TimeWindowImporter.parseEnvironmentChainTimeWindows(cursor, result.perEnvironment);
    return result;
  }

  private static parseEnvironmentChainTimeWindows(
    node: unknown,
    perEnvironment: Record<string, { start?: number; end?: number }>,
  ): void {
    const ifClause = TimeWindowImporter.asIfClause(node);
    if (!ifClause) return;

    const parsedCondition = TimeWindowImporter.extractEnvironmentCondition(ifClause[0]);
    if (parsedCondition?.environmentName) {
      const timeBounds = TimeWindowImporter.extractTimestampBounds(ifClause[0]);
      if (timeBounds && (timeBounds.start !== undefined || timeBounds.end !== undefined)) {
        perEnvironment[parsedCondition.environmentName] = timeBounds;
      }
    }

    // Recursively parse the else clause
    TimeWindowImporter.parseEnvironmentChainTimeWindows(ifClause[2], perEnvironment);
  }

  private static extractEnvironmentCondition(
    condition: unknown,
  ): { environmentName: string } | null {
    if (!TimeWindowImporter.isRecord(condition)) return null;

    // Check for direct 'in' operator
    if (JSONLOGIC_IN_OPERATOR in condition) {
      const inOp = condition[JSONLOGIC_IN_OPERATOR];
      if (Array.isArray(inOp) && inOp.length === 2) {
        const varPart = inOp[0];
        const valuesPart = inOp[1];
        if (
          TimeWindowImporter.isRecord(varPart) &&
          varPart[JSONLOGIC_VAR_PROPERTY] === TimeWindowImporter.ENVIRONMENT_VAR_NAME &&
          Array.isArray(valuesPart) &&
          valuesPart.length > 0
        ) {
          return { environmentName: String(valuesPart[0]) };
        }
      }
    }

    // Check for 'and' combining environment and time conditions
    if ('and' in condition) {
      const parts = condition['and'];
      if (Array.isArray(parts)) {
        for (const part of parts) {
          const envResult = TimeWindowImporter.extractEnvironmentCondition(part);
          if (envResult) {
            return envResult;
          }
        }
      }
    }

    return null;
  }

  private static extractTimestampBounds(value: unknown): { start?: number; end?: number } | null {
    if (!TimeWindowImporter.isRecord(value)) return null;

    if ('>=' in value) {
      const start = TimeWindowImporter.readTimestampComparison(value['>=']);
      return start !== null ? { start } : null;
    }

    if ('<=' in value) {
      const end = TimeWindowImporter.readTimestampComparison(value['<=']);
      return end !== null ? { end } : null;
    }

    if ('and' in value) {
      const subConditions = value['and'];
      if (!Array.isArray(subConditions) || subConditions.length === 0) return null;

      let start: number | undefined;
      let end: number | undefined;

      for (const subCondition of subConditions) {
        const parsed = TimeWindowImporter.extractTimestampBounds(subCondition);
        if (!parsed) return null;
        if (parsed.start !== undefined) start = parsed.start;
        if (parsed.end !== undefined) end = parsed.end;
      }

      if (start === undefined && end === undefined) return null;
      return { start, end };
    }

    return null;
  }

  private static readTimestampComparison(value: unknown): number | null {
    if (!Array.isArray(value) || value.length < 2) return null;

    const varPart = value[0];
    const timePart = value[1];

    // Check if first element is the timestamp variable
    if (
      TimeWindowImporter.isRecord(varPart) &&
      varPart[JSONLOGIC_VAR_PROPERTY] === TimeWindowImporter.TIMESTAMP_CONTEXT_VAR
    ) {
      if (typeof timePart === 'number' && Number.isFinite(timePart)) {
        return timePart;
      }
    }

    // Check if second element is the timestamp variable (reversed comparison)
    if (
      TimeWindowImporter.isRecord(timePart) &&
      timePart[JSONLOGIC_VAR_PROPERTY] === TimeWindowImporter.TIMESTAMP_CONTEXT_VAR
    ) {
      if (typeof varPart === 'number' && Number.isFinite(varPart)) {
        return varPart;
      }
    }

    return null;
  }

  private static asIfClause(value: unknown): [unknown, unknown, unknown] | null {
    if (!TimeWindowImporter.isRecord(value) || !('if' in value)) return null;
    const ifValue = value['if'];
    if (Array.isArray(ifValue) && ifValue.length === 3) {
      return [ifValue[0], ifValue[1], ifValue[2]];
    }
    return null;
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !(value instanceof Array);
  }
}

/**
 * Utility functions for flag type conversions
 */
export class FlagTypeConverter {
  static getDefaultValueForType(flagType: 'boolean' | 'string' | 'number' | 'object'): unknown {
    switch (flagType) {
      case 'boolean':
        return true;
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'object':
        return {};
    }
  }
}
