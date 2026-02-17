import { Injectable } from '@angular/core';
import { JsonValue, OpenFeature, Provider } from '@openfeature/web-sdk';
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import {
  EvaluationResult,
  PlaygroundEvaluationRequest,
  PlaygroundEvaluator,
} from './playground-evaluation.types';

const OF_DOMAIN = 'flagd-ui-playground';
const PROVIDER_SETUP_TIMEOUT_MS = 10000;

@Injectable()
export class PlaygroundOfrepEvaluatorService implements PlaygroundEvaluator {
  readonly type = 'ofrep' as const;
  private connectedServerId: string | null = null;

  async evaluate(request: PlaygroundEvaluationRequest): Promise<EvaluationResult> {
    if (!request.server) {
      throw new Error('No OFREP server selected.');
    }

    await this.withTimeout(
      this.ensureProvider(request),
      PROVIDER_SETUP_TIMEOUT_MS,
      'Could not connect to the configured OFREP server in time.',
    );

    const client = OpenFeature.getClient(OF_DOMAIN, 'flagd-ui');
    const flagType = this.inferFlagType(request.flag.variants);
    const fallbackValue = this.resolveFallbackValue(request.flag, flagType);

    let details: EvaluationResult;

    if (flagType === 'boolean') {
      details = client.getBooleanDetails(request.flag.key, Boolean(fallbackValue));
    } else if (flagType === 'string') {
      details = client.getStringDetails(request.flag.key, String(fallbackValue));
    } else if (flagType === 'number') {
      details = client.getNumberDetails(request.flag.key, Number(fallbackValue));
    } else {
      details = client.getObjectDetails(request.flag.key, fallbackValue as JsonValue);
    }

    return {
      ...details,
      wouldUseFallbackValue:
        this.isFallbackVariant(request.flag, details.variant) ||
        this.isFallbackReason(details.reason),
    };
  }

  private async ensureProvider(request: PlaygroundEvaluationRequest): Promise<void> {
    const server = request.server;
    if (!server) {
      throw new Error('No OFREP server selected.');
    }

    if (this.connectedServerId !== server.id) {
      const provider: Provider = new OFREPWebProvider({
        baseUrl: server.url,
      }) as unknown as Provider;

      await OpenFeature.setProviderAndWait(OF_DOMAIN, provider, request.context);
      this.connectedServerId = server.id;
      return;
    }

    await OpenFeature.setContext(OF_DOMAIN, request.context);
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        }),
      ]);
    } catch (error) {
      this.connectedServerId = null;
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private resolveFallbackValue(
    flag: PlaygroundEvaluationRequest['flag'],
    flagType: ReturnType<PlaygroundOfrepEvaluatorService['inferFlagType']>,
  ): unknown {
    if (typeof flag.defaultVariant === 'string' && this.hasVariant(flag, flag.defaultVariant)) {
      return flag.variants[flag.defaultVariant];
    }

    const firstVariant = Object.values(flag.variants)[0];
    if (firstVariant !== undefined) {
      return firstVariant;
    }

    if (flagType === 'boolean') return false;
    if (flagType === 'string') return '';
    if (flagType === 'number') return 0;
    return {};
  }

  private hasVariant(flag: PlaygroundEvaluationRequest['flag'], variantName: string): boolean {
    return Object.prototype.hasOwnProperty.call(flag.variants, variantName);
  }

  private isFallbackVariant(flag: PlaygroundEvaluationRequest['flag'], variant?: string): boolean {
    if (!variant) return true;
    return !this.hasVariant(flag, variant);
  }

  private isFallbackReason(reason?: string): boolean {
    return reason === 'DEFAULT' || reason === 'ERROR';
  }

  private inferFlagType(
    variants: Record<string, unknown>,
  ): 'boolean' | 'string' | 'number' | 'object' {
    const values = Object.values(variants);
    if (values.length === 0) return 'boolean';
    const first = values[0];
    if (typeof first === 'boolean') return 'boolean';
    if (typeof first === 'number') return 'number';
    if (typeof first === 'string') return 'string';
    return 'object';
  }
}
