import { TimeWindow } from './flagd-abstraction-models';
import { JSONLOGIC_IN_OPERATOR, JSONLOGIC_VAR_PROPERTY } from './flagd-constants';

/**
 * Bounds with Unix timestamp numbers
 * At least one of start or end must be defined
 */
interface TimestampBoundsStart {
  start: number;
  end?: number;
}
interface TimestampBoundsEnd {
  start?: number;
  end: number;
}
type TimestampBounds = TimestampBoundsStart | TimestampBoundsEnd;

/**
 * Converts per-environment definitions (with time windows) into JsonLogic targeting
 */
export class TimeWindowExporter {
  private static readonly ENVIRONMENT_VAR_NAME = 'environment';
  private static readonly TIMESTAMP_CONTEXT_VAR = '$flagd.timestamp';

  static buildTargetingFromTimeWindows(
    perEnvDefs: Record<string, { value: unknown; timeWindow?: TimeWindow }>,
    globalValueDef?: { value: unknown; timeWindow?: TimeWindow },
  ): Record<string, unknown> | null {
    const envTimeWindows: Record<string, TimestampBounds> = {};

    for (const [envName, def] of Object.entries(perEnvDefs)) {
      if (def.timeWindow) {
        const bounds = TimeWindowExporter.convertTimeWindowToBounds(def.timeWindow);
        if (bounds) {
          envTimeWindows[envName.toLowerCase()] = bounds;
        }
      }
    }

    // Build environment chain with time windows
    let environmentChain: Record<string, unknown> | null = null;
    if (Object.keys(envTimeWindows).length > 0) {
      let chain: Record<string, unknown> | null = null;
      for (const [envName, bounds] of Object.entries(envTimeWindows)) {
        const condition = {
          [JSONLOGIC_IN_OPERATOR]: [
            { [JSONLOGIC_VAR_PROPERTY]: TimeWindowExporter.ENVIRONMENT_VAR_NAME },
            [envName],
          ],
        };

        let nextCondition: Record<string, unknown> = condition;
        const timeCondition = TimeWindowExporter.buildTimestampCondition(bounds);
        if (timeCondition) {
          nextCondition = { and: [condition, timeCondition] };
        }

        if (chain === null) {
          chain = { if: [nextCondition, 'on', 'off'] };
        } else {
          chain = { if: [nextCondition, 'on', chain] };
        }
      }
      environmentChain = chain;
    }

    // If there's a global value definition with time window, wrap environment chain
    if (globalValueDef && globalValueDef['timeWindow']) {
      const globalBounds = TimeWindowExporter.convertTimeWindowToBounds(
        globalValueDef['timeWindow'],
      );
      if (globalBounds) {
        const globalCondition = TimeWindowExporter.buildTimestampCondition(globalBounds);
        if (globalCondition) {
          const thenValue = globalValueDef['value'];
          const elseValue = environmentChain || 'off';
          return { if: [globalCondition, thenValue, elseValue] };
        }
      }
    }

    return environmentChain;
  }

  private static convertTimeWindowToBounds(timeWindow: TimeWindow): TimestampBounds | null {
    const bounds: Partial<TimestampBounds> = {};
    if ('startTime' in timeWindow && timeWindow.startTime !== undefined) {
      bounds.start = Math.floor(timeWindow.startTime.getTime() / 1000);
    }
    if ('endTime' in timeWindow && timeWindow.endTime !== undefined) {
      bounds.end = Math.floor(timeWindow.endTime.getTime() / 1000);
    }
    // Return bounds only if at least one field is defined
    if (bounds.start !== undefined || bounds.end !== undefined) {
      return bounds as TimestampBounds;
    }
    return null;
  }

  private static buildTimestampCondition(bounds: TimestampBounds): Record<string, unknown> | null {
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
    global?: { value?: unknown; timeWindow?: TimestampBounds };
    perEnvironment: Record<string, { start?: number; end?: number; variant?: unknown }>;
  } {
    const result: {
      global?: { value?: unknown; timeWindow?: TimestampBounds };
      perEnvironment: Record<string, { start?: number; end?: number; variant?: unknown }>;
    } = {
      perEnvironment: {},
    };

    if (!targeting) return result;

    let cursor: unknown = targeting;
    const maybeIf = TimeWindowImporter.asIfClause(cursor);

    if (maybeIf) {
      // Check if this is a global time window condition (not environment-based)
      const maybeGlobalTimeWindow = TimeWindowImporter.extractTimestampBounds(maybeIf[0]);
      const maybeEnvCondition = TimeWindowImporter.extractEnvironmentCondition(maybeIf[0]);

      // If there's a timestamp bounds AND no environment condition, this is a global time window
      if (maybeGlobalTimeWindow && !maybeEnvCondition) {
        result.global = {
          value: maybeIf[1],
          timeWindow: maybeGlobalTimeWindow,
        };
        cursor = maybeIf[2];
      }
    }

    TimeWindowImporter.parseEnvironmentChainTimeWindows(cursor, result.perEnvironment);
    return result;
  }

  private static parseEnvironmentChainTimeWindows(
    node: unknown,
    perEnvironment: Record<string, { start?: number; end?: number; variant?: unknown }>,
  ): void {
    const ifClause = TimeWindowImporter.asIfClause(node);
    if (!ifClause) return;

    const parsedCondition = TimeWindowImporter.extractEnvironmentCondition(ifClause[0]);
    if (parsedCondition?.environmentName) {
      const timeBounds = TimeWindowImporter.extractTimestampBounds(ifClause[0]);
      if (timeBounds && (timeBounds.start !== undefined || timeBounds.end !== undefined)) {
        perEnvironment[parsedCondition.environmentName] = { ...timeBounds };
      } else {
        // Even without time bounds, store the environment mapping with its variant
        if (!perEnvironment[parsedCondition.environmentName]) {
          perEnvironment[parsedCondition.environmentName] = {};
        }
      }
      // Store the variant value (the "then" clause)
      perEnvironment[parsedCondition.environmentName].variant = ifClause[1];
    }

    // Recursively parse the else clause
    TimeWindowImporter.parseEnvironmentChainTimeWindows(ifClause[2], perEnvironment);
  }

  private static extractEnvironmentCondition(
    condition: unknown,
  ): { environmentName: string } | null {
    if (!TimeWindowImporter.isRecord(condition)) return null;

    // Check for $ref reference to an evaluator
    const refKey = '$ref';
    if (refKey in condition) {
      const refValue = condition[refKey];
      if (typeof refValue === 'string') {
        // Extract environment name from evaluator reference (e.g., 'isProduction' -> 'production')
        const prefix = 'is';
        if (refValue.startsWith(prefix)) {
          const envName = refValue.slice(prefix.length).toLowerCase();
          return { environmentName: envName };
        }
      }
    }

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

  private static extractTimestampBounds(value: unknown): TimestampBounds | null {
    if (!TimeWindowImporter.isRecord(value)) return null;

    if ('>=' in value) {
      const start = TimeWindowImporter.readTimestampComparison(value['>=']);
      return start !== null ? ({ start } as TimestampBounds) : null;
    }

    if ('<=' in value) {
      const end = TimeWindowImporter.readTimestampComparison(value['<=']);
      return end !== null ? ({ end } as TimestampBounds) : null;
    }

    if ('and' in value) {
      const subConditions = value['and'];
      if (!Array.isArray(subConditions) || subConditions.length === 0) return null;

      let start: number | undefined;
      let end: number | undefined;
      let foundAnyTimestamp = false;

      for (const subCondition of subConditions) {
        const parsed = TimeWindowImporter.extractTimestampBounds(subCondition);
        if (parsed) {
          foundAnyTimestamp = true;
          if ('start' in parsed && parsed.start !== undefined) start = parsed.start;
          if ('end' in parsed && parsed.end !== undefined) end = parsed.end;
        }
        // If parsed is null, skip this condition (e.g., environment conditions in an and block)
      }

      if (!foundAnyTimestamp) return null;
      // Create the appropriate union member based on which fields are defined
      if (start !== undefined) {
        return { start, end } as TimestampBounds;
      } else if (end !== undefined) {
        return { end } as TimestampBounds;
      }
      return null;
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
