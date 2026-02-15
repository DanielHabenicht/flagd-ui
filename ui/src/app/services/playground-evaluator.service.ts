import { inject, Injectable } from '@angular/core';
import { PlaygroundFlagdEvaluatorService } from './playground-flagd-evaluator.service';
import { PlaygroundEvaluationRequest, EvaluationResult } from './playground-evaluation.types';
import { PlaygroundLocalEvaluatorService } from './playground-local-evaluator.service';
import { PlaygroundOfrepEvaluatorService } from './playground-ofrep-evaluator.service';

@Injectable()
export class PlaygroundEvaluatorService {
  private readonly localEvaluator = inject(PlaygroundLocalEvaluatorService);
  private readonly flagdEvaluator = inject(PlaygroundFlagdEvaluatorService);
  private readonly ofrepEvaluator = inject(PlaygroundOfrepEvaluatorService);

  evaluate(request: PlaygroundEvaluationRequest): Promise<EvaluationResult> {
    const server = request.server;

    if (!server) {
      return this.localEvaluator.evaluate(request);
    }

    if (server.provider === 'flagd') {
      return this.flagdEvaluator.evaluate(request);
    }

    return this.ofrepEvaluator.evaluate(request);
  }
}
