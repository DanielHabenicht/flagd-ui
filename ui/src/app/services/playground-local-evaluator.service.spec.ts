import { describe, expect, it } from 'vitest';
import { PlaygroundFlag } from './playground-evaluation.types';
import { PlaygroundLocalEvaluatorService } from './playground-local-evaluator.service';

describe('PlaygroundLocalEvaluatorService', () => {
  const service = new PlaygroundLocalEvaluatorService();

  it('returns default variant for static flags without targeting', async () => {
    const flag: PlaygroundFlag = {
      key: 'show-banner',
      state: 'ENABLED',
      defaultVariant: 'on',
      variants: {
        on: true,
        off: false,
      },
    };

    const result = await service.evaluate({
      flag,
      context: { targetingKey: 'user-1' },
    });

    expect(result).toEqual({
      value: true,
      variant: 'on',
      reason: 'STATIC',
      wouldUseFallbackValue: false,
    });
  });

  it('resolves $ref evaluator chains for environment targeting', async () => {
    const flag: PlaygroundFlag = {
      key: 'show-banner',
      state: 'ENABLED',
      defaultVariant: 'off',
      targeting: {
        if: [{ $ref: 'isProd' }, 'on', 'off'],
      },
      variants: {
        on: true,
        off: false,
      },
    };

    const result = await service.evaluate({
      flag,
      context: { targetingKey: 'user-1', environment: 'prod' },
      evaluators: {
        isProd: {
          in: [{ var: 'environment' }, ['prod']],
        },
      },
    });

    expect(result).toEqual({
      value: true,
      variant: 'on',
      reason: 'TARGETING_MATCH',
      wouldUseFallbackValue: false,
    });
  });

  it('supports $flagd.timestamp from nested $flagd context', async () => {
    const flag: PlaygroundFlag = {
      key: 'time-window',
      state: 'ENABLED',
      defaultVariant: 'off',
      targeting: {
        if: [{ '<=': [{ var: '$flagd.timestamp' }, 1770854400] }, 'on', 'off'],
      },
      variants: {
        on: true,
        off: false,
      },
    };

    const result = await service.evaluate({
      flag,
      context: {
        targetingKey: 'user-1',
        $flagd: {
          timestamp: 1700000000,
        },
      },
    });

    expect(result).toEqual({
      value: true,
      variant: 'on',
      reason: 'TARGETING_MATCH',
      wouldUseFallbackValue: false,
    });
  });

  it('falls back to default with error details for unknown evaluator refs', async () => {
    const flag: PlaygroundFlag = {
      key: 'show-banner',
      state: 'ENABLED',
      defaultVariant: 'off',
      targeting: {
        if: [{ $ref: 'missingRef' }, 'on', 'off'],
      },
      variants: {
        on: true,
        off: false,
      },
    };

    const result = await service.evaluate({
      flag,
      context: { targetingKey: 'user-1' },
    });

    expect(result.value).toBe(false);
    expect(result.variant).toBe('off');
    expect(result.reason).toBe('ERROR');
    expect(result.wouldUseFallbackValue).toBe(false);
    expect(result.errorCode).toBe('LOCAL_EVALUATION_ERROR');
    expect(result.errorMessage).toContain('Unknown evaluator reference');
  });

  it('reports fallback usage when no default variant is available', async () => {
    const flag: PlaygroundFlag = {
      key: 'empty-fallback',
      state: 'ENABLED',
      variants: {},
    };

    const result = await service.evaluate({
      flag,
      context: { targetingKey: 'user-1' },
    });

    expect(result.value).toBe(false);
    expect(result.reason).toBe('STATIC');
    expect(result.wouldUseFallbackValue).toBe(true);
  });
});
