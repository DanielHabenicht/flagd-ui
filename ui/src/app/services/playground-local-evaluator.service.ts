import { Injectable } from '@angular/core';
import { EvaluationContext } from '@openfeature/web-sdk';
import { LogicEngine } from 'json-logic-engine';
import { Evaluator, FlagEntry, inferFlagType } from '../models/flag.models';
import {
  EvaluationResult,
  PlaygroundEvaluationRequest,
  PlaygroundEvaluator,
} from './playground-evaluation.types';

const jsonLogicEngine = new LogicEngine();

@Injectable({ providedIn: 'root' })
export class PlaygroundLocalEvaluatorService implements PlaygroundEvaluator {
  readonly type = 'local' as const;

  async evaluate(request: PlaygroundEvaluationRequest): Promise<EvaluationResult> {
    const { flag, context } = request;
    const defaultResult = this.resolveDefaultResult(flag);

    if (flag.state !== 'ENABLED') {
      return {
        ...defaultResult,
        reason: 'DISABLED',
      };
    }

    const targeting = flag.targeting;
    if (!targeting || Object.keys(targeting).length === 0) {
      return {
        ...defaultResult,
        reason: 'STATIC',
      };
    }

    try {
      const expandedTargeting = this.expandRefs(targeting, request.evaluators ?? {}, []);
      const evaluationContext = this.withFlagdBuiltIns(context);
      const outcome = jsonLogicEngine.run(
        expandedTargeting as unknown,
        evaluationContext as unknown,
      );

      if (typeof outcome === 'string' && this.hasVariant(flag, outcome)) {
        return {
          value: flag.variants[outcome],
          variant: outcome,
          reason: 'TARGETING_MATCH',
          wouldUseFallbackValue: false,
        };
      }

      if (outcome === null || outcome === undefined) {
        return {
          ...defaultResult,
          reason: 'DEFAULT',
        };
      }

      return {
        ...defaultResult,
        reason: 'DEFAULT',
        errorCode: 'INVALID_TARGETING_RESULT',
        errorMessage: `Targeting must resolve to a known variant key, got ${JSON.stringify(outcome)}.`,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'Local evaluation failed.';
      return {
        ...defaultResult,
        reason: 'ERROR',
        errorCode: 'LOCAL_EVALUATION_ERROR',
        errorMessage: message,
      };
    }
  }

  private expandRefs(
    value: unknown,
    evaluators: Record<string, Evaluator>,
    activeRefs: string[],
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.expandRefs(item, evaluators, activeRefs));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const record = value as Record<string, unknown>;
    const entries = Object.entries(record);

    if (
      entries.length === 1 &&
      entries[0][0] === '$ref' &&
      typeof entries[0][1] === 'string' &&
      entries[0][1].length > 0
    ) {
      const refName = entries[0][1];
      if (activeRefs.includes(refName)) {
        throw new Error(
          `Circular evaluator reference detected: ${[...activeRefs, refName].join(' -> ')}`,
        );
      }

      const referenced = evaluators[refName];
      if (!referenced || typeof referenced !== 'object') {
        throw new Error(`Unknown evaluator reference: ${refName}`);
      }

      return this.expandRefs(referenced, evaluators, [...activeRefs, refName]);
    }

    const expanded: Record<string, unknown> = {};
    for (const [key, nestedValue] of entries) {
      expanded[key] = this.expandRefs(nestedValue, evaluators, activeRefs);
    }
    return expanded;
  }

  private resolveDefaultResult(flag: FlagEntry): EvaluationResult {
    const defaultVariant =
      typeof flag.defaultVariant === 'string' && this.hasVariant(flag, flag.defaultVariant)
        ? flag.defaultVariant
        : undefined;

    if (defaultVariant) {
      return {
        value: flag.variants[defaultVariant],
        variant: defaultVariant,
        wouldUseFallbackValue: false,
      };
    }

    return {
      value: this.resolveFallbackValue(flag),
      wouldUseFallbackValue: true,
    };
  }

  private resolveFallbackValue(flag: FlagEntry): unknown {
    const firstVariant = Object.values(flag.variants)[0];
    if (firstVariant !== undefined) {
      return firstVariant;
    }

    const flagType = inferFlagType(flag.variants);
    if (flagType === 'boolean') return false;
    if (flagType === 'string') return '';
    if (flagType === 'number') return 0;
    return {};
  }

  private withFlagdBuiltIns(context: EvaluationContext): EvaluationContext {
    const base = context as Record<string, unknown>;
    const currentTimestamp = this.readTimestamp(base);
    const nestedFlagd = this.asRecord(base['$flagd']);

    return {
      ...context,
      $flagd: {
        ...nestedFlagd,
        timestamp: currentTimestamp,
      },
    };
  }

  private readTimestamp(context: Record<string, unknown>): number {
    const direct = context['$flagd.timestamp'];
    if (typeof direct === 'number' && Number.isFinite(direct)) {
      return direct;
    }

    const nested = this.asRecord(context['$flagd'])['timestamp'];
    if (typeof nested === 'number' && Number.isFinite(nested)) {
      return nested;
    }

    return Math.floor(Date.now() / 1000);
  }

  private hasVariant(flag: FlagEntry, variantName: string): boolean {
    return Object.prototype.hasOwnProperty.call(flag.variants, variantName);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }
}
