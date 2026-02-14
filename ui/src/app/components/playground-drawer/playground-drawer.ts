import { JsonPipe } from '@angular/common';
import { Component, computed, effect, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { EvaluationContext, JsonValue, OpenFeature, Provider } from '@openfeature/web-sdk';
import { FlagdWebProvider } from '@openfeature/flagd-web-provider';
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import { FlagEntry, inferFlagType } from '../../models/flag.models';
import {
  PlaygroundServerDialogComponent,
  PlaygroundServerDialogResult,
} from './playground-server-dialog';

type PlaygroundProviderType = 'flagd' | 'ofrep';

export interface PlaygroundServer {
  id: string;
  provider: PlaygroundProviderType;
  url: string;
}

interface EvaluationResult {
  value: unknown;
  variant?: string;
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
}

const STORAGE_KEY = 'flagd-ui-playground-servers';
const STORAGE_HEIGHT_KEY = 'flagd-ui-playground-height';
const OF_DOMAIN = 'flagd-ui-playground';
const PROVIDER_SETUP_TIMEOUT_MS = 10000;
const COLLAPSED_DRAWER_HEIGHT = 56;
const DEFAULT_DRAWER_HEIGHT = 280;
const MIN_DRAWER_HEIGHT = 180;
const MAX_DRAWER_HEIGHT = 760;

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
  templateUrl: './playground-drawer.html',
  styleUrl: './playground-drawer.scss',
})
export class PlaygroundDrawerComponent implements OnInit, OnDestroy {
  readonly flags = input<FlagEntry[]>([]);
  readonly selectedFlagKey = input<string | null>(null);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly open = signal(this.route.snapshot.queryParamMap.get('playground') === 'expanded');
  readonly animate = signal(false);
  readonly servers = signal<PlaygroundServer[]>(this.loadServers());
  readonly activeServerId = signal<string | null>(this.loadServers()[0]?.id ?? null);
  readonly localSelectedFlagKey = signal<string>('');
  readonly contextJson = signal('{\n  "targetingKey": "user-123"\n}');
  readonly drawerHeight = signal(this.loadDrawerHeight());
  readonly collapsedDrawerHeight = COLLAPSED_DRAWER_HEIGHT;

  readonly evaluating = signal(false);
  readonly evaluation = signal<EvaluationResult | null>(null);
  readonly evaluationError = signal<string | null>(null);
  readonly contextError = signal<string | null>(null);

  readonly activeServer = computed(() =>
    this.servers().find((server) => server.id === this.activeServerId()) ?? null,
  );

  readonly selectedFlag = computed(() => {
    const selected = this.localSelectedFlagKey();
    return this.flags().find((flag) => flag.key === selected) ?? null;
  });

  private connectedServerId: string | null = null;
  private isResizing = false;
  private resizeStartY = 0;
  private resizeStartHeight = DEFAULT_DRAWER_HEIGHT;

  private readonly syncSelectedFromInput = effect(() => {
    const current = this.localSelectedFlagKey();
    if (current && this.flags().some((flag) => flag.key === current)) return;

    const requested = this.selectedFlagKey();
    if (requested && this.flags().some((flag) => flag.key === requested)) {
      this.localSelectedFlagKey.set(requested);
      return;
    }

    const fallback = this.flags()[0]?.key ?? '';
    this.localSelectedFlagKey.set(fallback);
  });

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.open.set(params.get('playground') === 'expanded');
    });
  }

  ngOnDestroy(): void {
    this.stopResizing();
  }

  toggleDrawer(): void {
    this.animate.set(true);
    const nextOpen = !this.open();
    if (nextOpen) {
      this.drawerHeight.set(this.clampDrawerHeight(this.drawerHeight()));
    }
    this.open.set(nextOpen);
    this.updatePlaygroundQueryParam(nextOpen);
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
        activeServerId: this.activeServerId(),
      },
    });

    dialogRef.afterClosed().subscribe((result?: PlaygroundServerDialogResult) => {
      if (!result) return;

      this.servers.set(result.servers);
      const nextActive = result.activeServerId ?? result.servers[0]?.id ?? null;
      this.activeServerId.set(nextActive);
      this.persistServers(result.servers);

      if (
        !nextActive ||
        (this.connectedServerId && !result.servers.some((server) => server.id === this.connectedServerId))
      ) {
        this.connectedServerId = null;
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

    if (!server) {
      this.evaluation.set(null);
      this.evaluationError.set('Select a flagd server first.');
      return;
    }

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
      await this.withTimeout(
        this.ensureProvider(server, context),
        PROVIDER_SETUP_TIMEOUT_MS,
        'Could not connect to the configured flagd server in time.',
      );
      const client = OpenFeature.getClient(OF_DOMAIN, 'flagd-ui');
      const flagType = inferFlagType(flag.variants);
      const fallback = this.resolveDefaultValue(flag, flagType);

      let details: {
        value: unknown;
        variant?: string;
        reason?: string;
        errorCode?: string;
        errorMessage?: string;
      };

      if (flagType === 'boolean') {
        details = client.getBooleanDetails(flag.key, Boolean(fallback));
      } else if (flagType === 'string') {
        details = client.getStringDetails(flag.key, String(fallback));
      } else if (flagType === 'number') {
        details = client.getNumberDetails(flag.key, Number(fallback));
      } else {
        details = client.getObjectDetails(flag.key, fallback as JsonValue);
      }

      this.evaluation.set({
        value: details.value,
        variant: details.variant,
        reason: details.reason,
        errorCode: details.errorCode,
        errorMessage: details.errorMessage,
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
      this.connectedServerId = null;
    } finally {
      this.evaluating.set(false);
    }
  }

  private async ensureProvider(server: PlaygroundServer, context: EvaluationContext): Promise<void> {
    if (this.connectedServerId !== server.id) {
      let provider: Provider;

      if (server.provider === 'ofrep') {
        provider = new OFREPWebProvider({
          baseUrl: server.url,
        }) as unknown as Provider;
      } else {
        const parsedUrl = this.parseServerUrl(server.url);
        provider = new FlagdWebProvider({
          host: parsedUrl.host,
          port: parsedUrl.port,
          tls: parsedUrl.tls,
          pathPrefix: parsedUrl.pathPrefix,
          maxDelay: 5000,
          maxRetries: 3,
        });
      }

      await OpenFeature.setProviderAndWait(OF_DOMAIN, provider, context);
      this.connectedServerId = server.id;
      return;
    }

    await OpenFeature.setContext(OF_DOMAIN, context);
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

  private resolveDefaultValue(flag: FlagEntry, flagType: ReturnType<typeof inferFlagType>): unknown {
    const fromDefaultVariant = flag.defaultVariant ? flag.variants[flag.defaultVariant] : undefined;
    if (fromDefaultVariant !== undefined) return fromDefaultVariant;

    const firstVariant = Object.values(flag.variants)[0];
    if (firstVariant !== undefined) return firstVariant;

    if (flagType === 'boolean') return false;
    if (flagType === 'string') return '';
    if (flagType === 'number') return 0;
    return {};
  }

  private loadServers(): PlaygroundServer[] {
    if (typeof window === 'undefined') return [];

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as PlaygroundServer[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (server) =>
          typeof server?.id === 'string' &&
          (server.provider === 'flagd' || server.provider === 'ofrep') &&
          typeof server?.url === 'string',
      );
    } catch {
      return [];
    }
  }

  private loadDrawerHeight(): number {
    if (typeof window === 'undefined') return DEFAULT_DRAWER_HEIGHT;

    const raw = window.localStorage.getItem(STORAGE_HEIGHT_KEY);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_DRAWER_HEIGHT;
    return this.clampDrawerHeight(parsed);
  }

  private clampDrawerHeight(height: number): number {
    const viewportMax = typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.85) : MAX_DRAWER_HEIGHT;
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
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_HEIGHT_KEY, String(this.clampDrawerHeight(height)));
  }

  private parseServerUrl(rawUrl: string): {
    host: string;
    port: number;
    tls: boolean;
    pathPrefix: string;
  } {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('Server URL is invalid. Use a full URL such as https://localhost:8013/flagd-api');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Server URL must start with http:// or https://');
    }

    const tls = parsed.protocol === 'https:';
    const port = parsed.port ? Number(parsed.port) : tls ? 443 : 80;
    const normalizedPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');

    return {
      host: parsed.hostname,
      port,
      tls,
      pathPrefix: normalizedPath,
    };
  }

  private persistServers(servers: PlaygroundServer[]): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
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
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
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

  private updatePlaygroundQueryParam(expanded: boolean): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        playground: expanded ? 'expanded' : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
