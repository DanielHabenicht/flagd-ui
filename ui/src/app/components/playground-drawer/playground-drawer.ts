import { JsonPipe } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngxs/store';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { EvaluationContext } from '@openfeature/web-sdk';
import { FlagdSchema } from '../../models/generated/flagd-schema';
import { PlaygroundServer } from '../../models/playground.models';
import { PlaygroundEvaluatorService } from '../../services/playground-evaluator.service';
import { PlaygroundFlagdEvaluatorService } from '../../services/playground-flagd-evaluator.service';
import { PlaygroundLocalEvaluatorService } from '../../services/playground-local-evaluator.service';
import { PlaygroundOfrepEvaluatorService } from '../../services/playground-ofrep-evaluator.service';
import { EvaluationResult } from '../../services/playground-evaluation.types';
import { PlaygroundFlag } from '../../services/playground-evaluation.types';
import {
  PlaygroundServerDialogComponent,
  PlaygroundServerDialogResult,
} from './playground-server-dialog';
import {
  SetPlaygroundDrawerHeight,
  SetPlaygroundServers,
  TogglePlaygroundDrawer,
} from '../../state/playground-preferences.actions';
import { PlaygroundPreferencesState } from '../../state/playground-preferences.state';
import { FlagStoreState } from '../../state/flag-store.state';
import { Subscription } from 'rxjs';

const LOCAL_EVALUATOR_ID = '__local__';
const COLLAPSED_DRAWER_HEIGHT = 56;
const DEFAULT_DRAWER_HEIGHT = 280;
const MIN_DRAWER_HEIGHT = 180;
const MAX_DRAWER_HEIGHT = 760;
const AUTO_EVALUATE_DEBOUNCE_MS = 250;

@Component({
  selector: 'app-playground-drawer',
  standalone: true,
  imports: [
    JsonPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  providers: [
    PlaygroundEvaluatorService,
    PlaygroundFlagdEvaluatorService,
    PlaygroundLocalEvaluatorService,
    PlaygroundOfrepEvaluatorService,
  ],
  templateUrl: './playground-drawer.html',
  styleUrl: './playground-drawer.scss',
})
export class PlaygroundDrawerComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly ngxsStore = inject(Store);
  private readonly evaluator = inject(PlaygroundEvaluatorService);
  private readonly schemaState = this.ngxsStore.selectSignal(FlagStoreState.selectedSchema);

  readonly open = this.ngxsStore.selectSignal(PlaygroundPreferencesState.drawerOpen);
  readonly animate = signal(false);
  readonly servers = signal<PlaygroundServer[]>(
    this.ngxsStore.selectSnapshot(PlaygroundPreferencesState.servers),
  );
  readonly activeServerId = signal<string>(this.servers()[0]?.id ?? LOCAL_EVALUATOR_ID);
  readonly localEvaluatorId = LOCAL_EVALUATOR_ID;
  readonly localSelectedFlagKey = signal<string>('');
  readonly routeSelectedFlagKey = signal<string | null>(null);
  readonly contextJson = signal('{\n  "targetingKey": "user-123"\n}');
  readonly drawerHeight = signal(
    this.clampDrawerHeight(this.ngxsStore.selectSnapshot(PlaygroundPreferencesState.drawerHeight)),
  );
  readonly collapsedDrawerHeight = COLLAPSED_DRAWER_HEIGHT;

  readonly evaluating = signal(false);
  readonly evaluation = signal<EvaluationResult | null>(null);
  readonly evaluationError = signal<string | null>(null);
  readonly contextError = signal<string | null>(null);

  readonly activeServer = computed(
    () => this.servers().find((server) => server.id === this.activeServerId()) ?? null,
  );

  readonly flags = computed<PlaygroundFlag[]>(() => {
    const schema = this.getSchema();
    if (!schema?.flags) return [];
    return Object.entries(schema.flags).map(([key, flag]) => ({
      key,
      ...(flag as FlagdSchema['flags'][string]),
    }));
  });

  readonly evaluators = computed(() => this.getSchema()?.$evaluators);

  readonly selectedFlag = computed(() => {
    const selected = this.localSelectedFlagKey();
    return this.flags().find((flag) => flag.key === selected) ?? null;
  });
  private isResizing = false;
  private resizeStartY = 0;
  private resizeStartHeight = DEFAULT_DRAWER_HEIGHT;
  private autoEvaluateTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private routeParamsSub: Subscription | null = null;

  private readonly syncSelectedFromInput = effect(() => {
    const current = this.localSelectedFlagKey();
    if (current && this.flags().some((flag) => flag.key === current)) return;

    const requested = this.routeSelectedFlagKey();
    if (requested && this.flags().some((flag) => flag.key === requested)) {
      this.localSelectedFlagKey.set(requested);
      return;
    }

    const fallback = this.flags()[0]?.key ?? '';
    this.localSelectedFlagKey.set(fallback);
  });

  private readonly autoEvaluateLocal = effect(() => {
    const activeEvaluatorId = this.activeServerId();
    const selectedFlagKey = this.localSelectedFlagKey();
    this.contextJson();

    if (activeEvaluatorId !== LOCAL_EVALUATOR_ID || !selectedFlagKey) {
      this.clearAutoEvaluateTimer();
      return;
    }

    this.scheduleAutoEvaluate();
  });

  ngOnInit(): void {
    this.routeParamsSub = this.route.queryParamMap.subscribe((params) => {
      this.routeSelectedFlagKey.set(params.get('flag'));
    });
  }

  ngOnDestroy(): void {
    this.clearAutoEvaluateTimer();
    this.stopResizing();
    this.routeParamsSub?.unsubscribe();
  }

  toggleDrawer(): void {
    this.animate.set(true);
    this.ngxsStore.dispatch(new TogglePlaygroundDrawer());
  }

  onResizeStart(event: MouseEvent): void {
    if (!this.open()) return;

    this.isResizing = true;
    this.resizeStartY = event.clientY;
    this.resizeStartHeight = this.drawerHeight();
    window.addEventListener('mousemove', this.onResizeMove);
    window.addEventListener('mouseup', this.onResizeEnd);
    event.preventDefault();
  }

  onDrawerClick(): void {
    if (!this.open()) {
      this.toggleDrawer();
    }
  }

  setActiveServer(serverId: string | null): void {
    if (!serverId) return;
    this.activeServerId.set(serverId);
    this.evaluation.set(null);
    this.evaluationError.set(null);
  }

  onServerSelectionChange(value: string): void {
    this.setActiveServer(value);
  }

  openServerManager(): void {
    const dialogRef = this.dialog.open(PlaygroundServerDialogComponent, {
      width: '760px',
      data: {
        servers: this.servers(),
        activeServerId: this.activeServerId() === LOCAL_EVALUATOR_ID ? null : this.activeServerId(),
      },
    });

    dialogRef.afterClosed().subscribe((result?: PlaygroundServerDialogResult) => {
      if (!result) return;

      this.servers.set(result.servers);
      const previousActive = this.activeServerId();
      const nextActive =
        result.activeServerId ??
        (previousActive === LOCAL_EVALUATOR_ID
          ? LOCAL_EVALUATOR_ID
          : (result.servers[0]?.id ?? LOCAL_EVALUATOR_ID));
      this.activeServerId.set(nextActive);
      this.persistServers(result.servers);

      if (
        nextActive !== LOCAL_EVALUATOR_ID &&
        !result.servers.some((server) => server.id === nextActive)
      ) {
        this.activeServerId.set(result.servers[0]?.id ?? LOCAL_EVALUATOR_ID);
      }

      this.evaluation.set(null);
      this.evaluationError.set(null);
    });
  }

  onContextChange(value: string): void {
    this.contextJson.set(value);
    this.contextError.set(null);
  }

  onSelectedFlagChange(value: string): void {
    this.localSelectedFlagKey.set(value);
    this.evaluation.set(null);
    this.evaluationError.set(null);
  }

  async evaluate(): Promise<void> {
    const server = this.activeServer();
    const flag = this.selectedFlag();

    if (!flag) {
      this.evaluation.set(null);
      this.evaluationError.set('Select a flag to evaluate.');
      return;
    }

    const context = this.parseContext();
    if (!context) return;

    this.evaluating.set(true);
    this.evaluationError.set(null);

    try {
      const details = await this.evaluator.evaluate({
        flag,
        context,
        evaluators: this.evaluators(),
        server: server ?? undefined,
      });

      this.evaluation.set({
        value: details.value,
        variant: details.variant,
        reason: details.reason,
        errorCode: details.errorCode,
        errorMessage: details.errorMessage,
        wouldUseFallbackValue: details.wouldUseFallbackValue,
      });

      if (details.errorCode || details.errorMessage) {
        this.evaluationError.set(
          details.errorMessage
            ? `${details.errorCode ?? 'Evaluation error'}: ${details.errorMessage}`
            : `${details.errorCode}`,
        );
      }
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.evaluation.set(null);
      this.evaluationError.set(message);
    } finally {
      this.evaluating.set(false);
    }
  }

  private parseContext(): EvaluationContext | null {
    try {
      const parsed = JSON.parse(this.contextJson()) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.contextError.set('Context must be a JSON object.');
        return null;
      }
      this.contextError.set(null);
      return parsed as EvaluationContext;
    } catch {
      this.contextError.set('Context must be valid JSON.');
      return null;
    }
  }

  private clampDrawerHeight(height: number): number {
    const viewportMax =
      typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.85) : MAX_DRAWER_HEIGHT;
    const maxHeight = Math.min(viewportMax, MAX_DRAWER_HEIGHT);
    return Math.max(MIN_DRAWER_HEIGHT, Math.min(height, maxHeight));
  }

  private readonly onResizeMove = (event: MouseEvent): void => {
    if (!this.isResizing) return;
    const deltaY = this.resizeStartY - event.clientY;
    const nextHeight = this.clampDrawerHeight(this.resizeStartHeight + deltaY);
    this.drawerHeight.set(nextHeight);
  };

  private readonly onResizeEnd = (): void => {
    if (!this.isResizing) return;
    this.stopResizing();
    this.persistDrawerHeight(this.drawerHeight());
  };

  private stopResizing(): void {
    this.isResizing = false;
    window.removeEventListener('mousemove', this.onResizeMove);
    window.removeEventListener('mouseup', this.onResizeEnd);
  }

  private persistDrawerHeight(height: number): void {
    this.ngxsStore.dispatch(new SetPlaygroundDrawerHeight(this.clampDrawerHeight(height)));
  }

  private persistServers(servers: PlaygroundServer[]): void {
    this.ngxsStore.dispatch(new SetPlaygroundServers(servers));
  }

  private scheduleAutoEvaluate(): void {
    this.clearAutoEvaluateTimer();
    this.autoEvaluateTimeoutId = setTimeout(() => {
      this.autoEvaluateTimeoutId = null;
      if (this.activeServerId() !== LOCAL_EVALUATOR_ID) return;
      void this.evaluate();
    }, AUTO_EVALUATE_DEBOUNCE_MS);
  }

  private clearAutoEvaluateTimer(): void {
    if (!this.autoEvaluateTimeoutId) return;
    clearTimeout(this.autoEvaluateTimeoutId);
    this.autoEvaluateTimeoutId = null;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }

    return 'Evaluation failed.';
  }

  private getSchema(): FlagdSchema | null {
    const schema = this.schemaState();
    if (!schema || typeof schema !== 'object') return null;
    return schema as FlagdSchema;
  }
}
