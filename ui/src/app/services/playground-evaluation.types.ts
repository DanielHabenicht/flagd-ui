import { EvaluationContext } from '@openfeature/web-sdk';
import { BaseFlag, Evaluators } from '../models/generated/flagd-schema';
import { PlaygroundServer } from '../models/playground.models';

export type PlaygroundFlag = BaseFlag & { key: string };

export interface EvaluationResult {
  value: unknown;
  variant?: string;
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  wouldUseFallbackValue?: boolean;
}

export interface PlaygroundEvaluationRequest {
  flag: PlaygroundFlag;
  context: EvaluationContext;
  evaluators?: Evaluators;
  server?: PlaygroundServer;
}

export interface PlaygroundEvaluator {
  readonly type: 'local' | 'flagd' | 'ofrep';
  evaluate(request: PlaygroundEvaluationRequest): Promise<EvaluationResult>;
}
