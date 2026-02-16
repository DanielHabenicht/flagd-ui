import { Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngxs/store';
import { Navigate } from '@ngxs/router-plugin';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FlagEditorComponent } from '../flag-editor/flag-editor';
import { FlagEntry, FlagDefinition, inferFlagType } from '../../models/flag.models';
import { DisplayFlag } from '../../models/abstraction/flagd-abstraction-models';
import { FlagStoreState } from '../../state/current-flag-store.state';
import {
  SelectFlagsFileByRoute,
  SaveFlag,
  RenameFlag,
  DeleteFlag,
} from '../../state/flag-store.actions';

@Component({
  selector: 'app-flags-file-detail',
  standalone: true,
  imports: [
    FlagEditorComponent,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSortModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './flags-file-detail.html',
  styleUrl: './flags-file-detail.scss',
})
export class FlagsFileDetailComponent implements OnInit {
  private readonly ngxsStore = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly inlineEditorMinWidth = 1280;
  private readonly keepEditorOpenAfterSaveMinWidth = 1920;
  private readonly initialWideLayout =
    typeof window !== 'undefined' && window.innerWidth >= this.inlineEditorMinWidth;
  private readonly routeSelectedFlagKey = signal<string | null>(null);

  readonly flagEntries = this.ngxsStore.selectSignal(FlagStoreState.flagEntries);
  readonly currentFlagsFile = this.ngxsStore.selectSignal(FlagStoreState.currentFlagsFile);
  readonly currentFlags = this.ngxsStore.selectSignal(FlagStoreState.currentFlags);
  readonly currentMetadata = this.ngxsStore.selectSignal(FlagStoreState.currentMetadata);
  readonly currentEvaluators = this.ngxsStore.selectSignal(FlagStoreState.currentEvaluators);
  readonly loading = this.ngxsStore.selectSignal(FlagStoreState.loading);
  readonly error = this.ngxsStore.selectSignal(FlagStoreState.error);

  showEditor = signal(false);
  editingFlag = signal<FlagEntry | null>(null);
  readonly editingDisplayFlag = computed(() => {
    const entry = this.editingFlag();
    if (!entry) return null;

    // Infer flag type from variants
    let flagType: 'boolean' | 'string' | 'number' | 'object' = 'object';
    const variantValues = Object.values(entry.variants ?? {});
    if (variantValues.length > 0) {
      const first = variantValues[0];
      if (typeof first === 'boolean') flagType = 'boolean';
      else if (typeof first === 'number') flagType = 'number';
      else if (typeof first === 'string') flagType = 'string';
    }

    return {
      key: entry.key,
      type: flagType,
      state: entry.state,
      value: entry.defaultVariant ? entry.variants[entry.defaultVariant] : null,
      metadata: entry.metadata,
    } as DisplayFlag;
  });
  isWideLayout = signal(this.initialWideLayout);
  readonly selectedFlagKey = computed(() => this.editingFlag()?.key ?? null);
  readonly existingFlagKeys = computed(() => this.flagEntries().map((f) => f.key));
  readonly showInlineEditor = computed(() => this.showEditor() && this.isWideLayout());
  readonly searchQuery = signal('');
  readonly sortColumn = signal<'key' | 'type' | 'state' | 'default' | 'targeting'>('key');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly displayedColumns = [
    'state',
    'key',
    'type',
    'default',
    'info',
    'targeting',
    'actions',
  ] as const;
  readonly visibleFlagEntries = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const entries = this.flagEntries();
    const filteredEntries = query
      ? entries.filter((flag) => this.getSearchText(flag).includes(query))
      : entries;

    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    const sorted = [...filteredEntries].sort((left, right) => {
      const leftValue = this.getSortValue(left, this.sortColumn());
      const rightValue = this.getSortValue(right, this.sortColumn());

      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return 1 * direction;
      return left.key.localeCompare(right.key) * direction;
    });

    return sorted;
  });

  private readonly syncSelectedFlagFromRoute = effect(() => {
    const selectedFlagKey = this.routeSelectedFlagKey();
    if (!selectedFlagKey) return;

    const match = this.flagEntries().find((entry) => entry.key === selectedFlagKey);
    if (!match) return;

    this.editingFlag.set(match);
    this.showEditor.set(true);
  });

  getFlagType(flag: FlagEntry): string {
    return inferFlagType(flag.variants);
  }

  getVariantNames(flag: FlagEntry): string[] {
    return Object.keys(flag.variants);
  }

  getDefaultValue(flag: FlagEntry): unknown {
    const defaultVariant = flag.defaultVariant;
    if (!defaultVariant) return null;
    if (!Object.prototype.hasOwnProperty.call(flag.variants, defaultVariant)) return null;
    return flag.variants[defaultVariant];
  }

  getDefaultValueDisplay(flag: FlagEntry): string {
    return this.stringifyValue(this.getDefaultValue(flag));
  }

  getVariantValueCounts(
    flag: FlagEntry,
  ): { value: string; count: number; variantNames: string[] }[] {
    const counts = new Map<string, { count: number; variantNames: string[] }>();

    for (const [variantName, variantValue] of Object.entries(flag.variants)) {
      const value = this.stringifyValue(variantValue);
      const existing = counts.get(value);

      if (existing) {
        existing.count += 1;
        existing.variantNames.push(variantName);
        continue;
      }

      counts.set(value, { count: 1, variantNames: [variantName] });
    }

    return [...counts.entries()]
      .map(([value, data]) => ({
        value,
        count: data.count,
        variantNames: [...data.variantNames].sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => left.value.localeCompare(right.value));
  }

  hasTargeting(flag: FlagEntry): boolean {
    return !!flag.targeting && Object.keys(flag.targeting).length > 0;
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.searchQuery.set(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  onSortChange(sort: Sort): void {
    if (!sort.active || !sort.direction) return;
    this.sortColumn.set(sort.active as 'key' | 'type' | 'state' | 'default' | 'targeting');
    this.sortDirection.set(sort.direction);
  }

  onFlagStateToggle(flag: FlagEntry, checked: boolean): void {
    const updatedFlag: FlagDefinition = {
      state: checked ? 'ENABLED' : 'DISABLED',
      variants: flag.variants,
      defaultVariant: flag.defaultVariant,
      targeting: flag.targeting,
      metadata: flag.metadata,
    };

    this.ngxsStore.dispatch(new SaveFlag(flag.key, updatedFlag));

    if (this.editingFlag()?.key === flag.key) {
      this.editingFlag.set({ key: flag.key, ...updatedFlag });
    }
  }

  confirmDelete(flag: FlagEntry): void {
    if (confirm(`Delete flag "${flag.key}"?`)) {
      this.onDeleteFlag(flag.key);
    }
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const name = params.get('name');
      const backendId = params.get('backendId');
      if (!name) return;

      const routePath = this.route.snapshot.routeConfig?.path ?? '';
      if (routePath.startsWith('flags-files/remote')) {
        this.ngxsStore.dispatch(new SelectFlagsFileByRoute('remote', name, backendId ?? undefined));
      } else {
        this.ngxsStore.dispatch(new SelectFlagsFileByRoute('local', name));
      }
    });

    this.route.queryParamMap.subscribe((params) => {
      this.routeSelectedFlagKey.set(params.get('flag'));
    });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const isWide = window.innerWidth >= this.inlineEditorMinWidth;
    this.isWideLayout.set(isWide);
    if (!isWide) {
      this.showEditor.set(false);
    } else if (this.editingFlag()) {
      this.showEditor.set(true);
    }
  }

  openNewFlagEditor(): void {
    if (!this.isWideLayout()) {
      this.navigateToEditRoute(null);
      return;
    }

    this.editingFlag.set(null);
    this.showEditor.set(true);
  }

  openEditFlagEditor(flag: FlagEntry): void {
    if (!this.isWideLayout()) {
      this.navigateToEditRoute(flag.key);
      return;
    }

    this.editingFlag.set(flag);
    this.showEditor.set(true);
  }

  openPageEditor(): void {
    this.navigateToEditRoute(this.selectedFlagKey());
  }

  closeEditor(): void {
    this.showEditor.set(false);
    this.editingFlag.set(null);
  }

  onSaveFlag(event: { key: string; flag: DisplayFlag; originalKey?: string }): void {
    // Convert DisplayFlag back to FlagDefinition for the store
    const variants: Record<string, unknown> = {};
    const variantKey = event.flag.type === 'boolean' ? 'on' : 'default';
    variants[variantKey] = event.flag.value;

    const flagDefinition = {
      state: event.flag.state,
      variants,
      defaultVariant: variantKey,
      ...(event.flag.metadata && { metadata: event.flag.metadata }),
    };

    if (event.originalKey && event.originalKey !== event.key) {
      this.ngxsStore.dispatch(new RenameFlag(event.originalKey, event.key, flagDefinition));
    } else {
      this.ngxsStore.dispatch(new SaveFlag(event.key, flagDefinition));
    }

    if (window.innerWidth >= this.keepEditorOpenAfterSaveMinWidth) {
      this.editingFlag.set({
        key: event.key,
        ...flagDefinition,
      });
      this.showEditor.set(true);
      return;
    }

    this.closeEditor();
  }

  onDeleteFlag(key: string): void {
    if (this.editingFlag()?.key === key) {
      this.closeEditor();
    }
    this.ngxsStore.dispatch(new DeleteFlag(key));
  }

  downloadFlagsFile(): void {
    const flagsFile = this.currentFlagsFile();
    const flags = this.currentFlags();
    if (!flagsFile || !flags) return;

    const content = this.buildFlagsFileContent(flags, this.currentMetadata());
    const blob = new Blob([JSON.stringify(content, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flagsFile.name}.flagd.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildFlagsFileContent(
    flags: Record<string, FlagDefinition>,
    metadata: any,
  ): Record<string, any> {
    const content: any = {
      $schema: 'https://flagd.dev/schema/v0/flags.json',
      flags,
    };

    const evaluators = this.currentEvaluators();
    if (evaluators && Object.keys(evaluators).length > 0) {
      content.$evaluators = evaluators;
    }

    if (metadata && Object.keys(metadata).length > 0) {
      content.metadata = metadata;
    }

    return content;
  }

  openSettingsPage(): void {
    const name = this.route.snapshot.paramMap.get('name');
    if (!name) return;

    const backendId = this.route.snapshot.paramMap.get('backendId');
    if (backendId) {
      this.ngxsStore.dispatch(
        new Navigate(['/flags-files', 'remote', backendId, name, 'settings'], undefined, {
          queryParamsHandling: 'merge',
        }),
      );
      return;
    }

    this.ngxsStore.dispatch(
      new Navigate(['/flags-files', 'local', name, 'settings'], undefined, {
        queryParamsHandling: 'merge',
      }),
    );
  }

  private navigateToEditRoute(flagKey: string | null): void {
    const name = this.route.snapshot.paramMap.get('name');
    if (!name) return;

    const backendId = this.route.snapshot.paramMap.get('backendId');
    const targetFlagKey = flagKey ?? 'new';

    if (backendId) {
      this.ngxsStore.dispatch(
        new Navigate(
          ['/flags-files', 'remote', backendId, name, 'edit', targetFlagKey],
          undefined,
          {
            queryParamsHandling: 'merge',
          },
        ),
      );
      return;
    }

    this.ngxsStore.dispatch(
      new Navigate(['/flags-files', 'local', name, 'edit', targetFlagKey], undefined, {
        queryParamsHandling: 'merge',
      }),
    );
  }

  private getSearchText(flag: FlagEntry): string {
    return [
      flag.key,
      inferFlagType(flag.variants),
      flag.state,
      this.getDefaultValueDisplay(flag),
      Object.keys(flag.variants).join(' '),
      Object.values(flag.variants)
        .map((value) => this.stringifyValue(value))
        .join(' '),
      this.hasTargeting(flag) ? 'yes' : 'no',
      this.hasTargeting(flag) ? JSON.stringify(flag.targeting) : '',
    ]
      .join(' ')
      .toLowerCase();
  }

  private getSortValue(
    flag: FlagEntry,
    column: 'key' | 'type' | 'state' | 'default' | 'targeting',
  ): string {
    switch (column) {
      case 'key':
        return flag.key.toLowerCase();
      case 'type':
        return inferFlagType(flag.variants);
      case 'state':
        return flag.state;
      case 'default':
        return this.getDefaultValueDisplay(flag).toLowerCase();
      case 'targeting':
        return this.hasTargeting(flag) ? 'yes' : 'no';
    }
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }
}
