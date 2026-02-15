import { describe, expect, it } from 'vitest';
import { Environment } from '../models/flag.models';
import { FlagSchemaAdapter } from './flag-schema-adapter';

describe('FlagSchemaAdapter', () => {
  const adapter = new FlagSchemaAdapter();

  it('parses editor state from valid JSON', () => {
    const result = adapter.parseEditorStateFromJson(
      JSON.stringify({
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'on',
        targeting: { if: [{ var: '$flagd.timestamp' }, 'on', 'off'] },
        metadata: { owner: 'team-a' },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.state).toBe('ENABLED');
    expect(result.value.flagType).toBe('boolean');
    expect(result.value.easyType).toBe('boolean');
    expect(result.value.hasDefaultVariant).toBe(true);
    expect(result.value.defaultVariant).toBe('on');
    expect(result.value.variants).toEqual([
      { name: 'on', value: true },
      { name: 'off', value: false },
    ]);
  });

  it('validates JSON save requirements', () => {
    const missingState = adapter.parseFlagForSave(JSON.stringify({ variants: { on: true } }));
    expect(missingState.ok).toBe(false);
    if (missingState.ok) return;
    expect(missingState.error).toBe('Missing required field: "state"');

    const missingVariants = adapter.parseFlagForSave(JSON.stringify({ state: 'ENABLED' }));
    expect(missingVariants.ok).toBe(false);
    if (missingVariants.ok) return;
    expect(missingVariants.error).toBe('Must have at least one variant');
  });

  it('builds and parses easy time window targeting', () => {
    const targeting = adapter.buildEasyTimeTargeting({
      start: 1700000000,
      end: 1700003600,
    });

    expect(targeting).toEqual({
      if: [
        {
          and: [
            { '>=': [{ var: '$flagd.timestamp' }, 1700000000] },
            { '<=': [{ var: '$flagd.timestamp' }, 1700003600] },
          ],
        },
        'on',
        'off',
      ],
    });

    const parsed = adapter.parseEasyTimeTargeting(targeting);
    expect(parsed).toEqual({ start: 1700000000, end: 1700003600 });
  });

  it('builds environment targeting with global and per-environment windows', () => {
    const environments: Environment[] = [
      { name: 'dev', displayName: 'Dev', aliases: ['dev'] },
      { name: 'prod', displayName: 'Prod', aliases: ['prod'] },
    ];

    const targeting = adapter.buildEnvironmentTimeAwareTargeting(
      environments,
      { start: 1700000000 },
      {
        dev: { end: 1700003600 },
        prod: null,
      },
    );

    expect(targeting).toEqual({
      if: [
        { '>=': [{ var: '$flagd.timestamp' }, 1700000000] },
        {
          if: [
            {
              and: [{ $ref: 'isDev' }, { '<=': [{ var: '$flagd.timestamp' }, 1700003600] }],
            },
            'dev',
            {
              if: [{ $ref: 'isProd' }, 'prod', 'off'],
            },
          ],
        },
        'off',
      ],
    });
  });

  it('parses environment timing from nested targeting chain', () => {
    const targeting = {
      if: [
        { '>=': [{ var: '$flagd.timestamp' }, 1700000000] },
        {
          if: [
            {
              and: [{ $ref: 'isDev' }, { '<=': [{ var: '$flagd.timestamp' }, 1700003600] }],
            },
            'dev',
            {
              if: [{ $ref: 'isProd' }, 'prod', 'off'],
            },
          ],
        },
        'off',
      ],
    } as Record<string, unknown>;

    const parsed = adapter.parseEnvironmentTimingTargeting(targeting);
    expect(parsed.global).toEqual({ start: 1700000000 });
    expect(parsed.perEnvironment).toEqual({ dev: { end: 1700003600 } });
  });

  it('syncs JSON state while preserving payload', () => {
    const raw = JSON.stringify({ state: 'ENABLED', variants: { on: true } });
    const result = adapter.syncJsonState(raw, 'DISABLED');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = JSON.parse(result.value) as Record<string, unknown>;
    expect(parsed['state']).toBe('DISABLED');
    expect(parsed['variants']).toEqual({ on: true });
  });
});
