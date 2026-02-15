import { EvaluationContext } from '@openfeature/web-sdk';
import { Evaluator, FlagEntry } from '../models/flag.models';
import { PlaygroundServer } from '../models/playground.models';

export interface EvaluationResult {
  value: unknown;
  variant?: string;
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  wouldUseFallbackValue?: boolean;
}

export interface PlaygroundEvaluationRequest {
  flag: FlagEntry;
  context: EvaluationContext;
  evaluators?: Record<string, Evaluator>;
  server?: PlaygroundServer;
}

export interface PlaygroundEvaluator {
  readonly type: 'local' | 'flagd' | 'ofrep';
  evaluate(request: PlaygroundEvaluationRequest): Promise<EvaluationResult>;
}
