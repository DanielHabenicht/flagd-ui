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
import { FlagStoreState } from '../../state/flag-store.state';
import { FlagDto } from '../../services/flag-backend';
import { CreateFlag, DeleteFlag, UpdateFlag } from '../../state/flag-store.actions';

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
  private readonly initialWideLayout =
    typeof window !== 'undefined' && window.innerWidth >= this.inlineEditorMinWidth;
  private readonly routeSelectedFlagKey = signal<string | null>(null);

  readonly flagEntries = this.ngxsStore.selectSignal(FlagStoreState.flags);
  readonly currentCollectionId = this.ngxsStore.selectSignal(FlagStoreState.selectedCollectionId);

  showEditor = signal(false);
  editingFlag = signal<FlagDto | null>(null);
  readonly editingDisplayFlag = computed(() => this.editingFlag());
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

  getFlagType(flag: FlagDto): string {
    return flag.type;
  }

  getDefaultValue(flag: FlagDto): unknown {
    // TODO: Return any of the values
    return flag.booleanValue ?? null;
  }

  getDefaultValueDisplay(flag: FlagDto): string {
    return this.stringifyValue(this.getDefaultValue(flag));
  }

  getOverrideValueCounts(
    flag: FlagDto,
  ): { value: string; count: number; environmentNames: string[] }[] {
    const perEnvDefs = flag.perEnvironmentDefinitions ?? {};
    const entries = Object.entries(perEnvDefs);
    if (entries.length === 0) return [];

    const counts = new Map<string, { count: number; environmentNames: string[] }>();

    for (const [envName, envDef] of entries) {
      const value = this.stringifyValue(envDef?.booleanValue);
      const existing = counts.get(value);

      if (existing) {
        existing.count += 1;
        existing.environmentNames.push(envName);
        continue;
      }

      counts.set(value, { count: 1, environmentNames: [envName] });
    }

    return [...counts.entries()]
      .map(([value, data]) => ({
        value,
        count: data.count,
        environmentNames: [...data.environmentNames].sort((left, right) =>
          left.localeCompare(right),
        ),
      }))
      .sort((left, right) => left.value.localeCompare(right.value));
  }

  hasTargeting(flag: FlagDto): boolean {
    const perEnvDefs = flag.perEnvironmentDefinitions ?? {};
    return Object.keys(perEnvDefs).length > 0 || !!flag.globalTimeWindow?.timeWindowId;
  }

  hasGlobalTimeWindow(flag: FlagDto): boolean {
    return !!flag.globalTimeWindow?.timeWindowId;
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

  onFlagStateToggle(flag: FlagDto, checked: boolean): void {
    const updatedFlag: FlagDto = {
      ...flag,
      state: checked ? 'ENABLED' : 'DISABLED',
    };

    this.ngxsStore.dispatch(new UpdateFlag(this.currentCollectionId() as any, updatedFlag, flag.key));

    if (this.editingFlag()?.key === flag.key) {
      this.editingFlag.set(updatedFlag);
    }
  }

  confirmDelete(flag: FlagDto): void {
    if (confirm(`Delete flag "${flag.key}"?`)) {
      this.onDeleteFlag(flag.key);
    }
  }

  ngOnInit(): void {
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

  openEditFlagEditor(flag: FlagDto): void {
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

  onSaveFlag(event: { key: string; flag: FlagDto; originalKey?: string }): void {
    const updatedFlag: FlagDto = {
      ...event.flag,
      // key: event.key,
    };

    if (event.originalKey) {
      this.ngxsStore.dispatch(
        new UpdateFlag(this.currentCollectionId() as any, updatedFlag, event.originalKey),
      );
    } else {
      this.ngxsStore.dispatch(new CreateFlag(this.currentCollectionId() as any, updatedFlag));
    }

    this.editingFlag.set(updatedFlag);
    this.showEditor.set(true);
  }

  onDeleteFlag(key: string): void {
    if (this.editingFlag()?.key === key) {
      this.closeEditor();
    }
    this.ngxsStore.dispatch(new DeleteFlag(this.currentCollectionId() as any, key));
  }

  downloadFlagsFile(): void {
    // const fileName = this.currentFlagsFileName();
    // const schema = this.currentSchema();
    // if (!fileName || !schema) return;
    // const downloadName = fileName.endsWith('.flagd.json') ? fileName : `${fileName}.flagd.json`;
    // const blob = new Blob([JSON.stringify(schema, null, 2)], {
    //   type: 'application/json',
    // });
    // const url = URL.createObjectURL(blob);
    // const a = document.createElement('a');
    // a.href = url;
    // a.download = downloadName;
    // a.click();
    // URL.revokeObjectURL(url);
  }

  openSettingsPage(): void {
    const routeSegments = this.getFlagsFileRouteSegments();
    if (!routeSegments) return;

    this.ngxsStore.dispatch(
      new Navigate([...routeSegments, 'settings'], undefined, {
        queryParamsHandling: 'merge',
      }),
    );
  }

  private navigateToEditRoute(flagKey: string | null): void {
    const targetFlagKey = flagKey ?? 'new';
    const routeSegments = this.getFlagsFileRouteSegments();
    if (!routeSegments) return;

    this.ngxsStore.dispatch(
      new Navigate([...routeSegments, 'edit', targetFlagKey], undefined, {
        queryParamsHandling: 'merge',
      }),
    );
  }

  private getSearchText(flag: FlagDto): string {
    const perEnvDefs = flag.perEnvironmentDefinitions ?? {};
    return [
      flag.key,
      flag.type,
      flag.state,
      this.getDefaultValueDisplay(flag),
      Object.keys(perEnvDefs).join(' '),
      Object.values(perEnvDefs)
        .map((definition) => this.stringifyValue(definition?.booleanValue))
        .join(' '),
      flag.metadata ? JSON.stringify(flag.metadata) : '',
      this.hasTargeting(flag) ? 'yes' : 'no',
    ]
      .join(' ')
      .toLowerCase();
  }

  private getSortValue(
    flag: FlagDto,
    column: 'key' | 'type' | 'state' | 'default' | 'targeting',
  ): string {
    switch (column) {
      case 'key':
        return flag.key.toLowerCase();
      case 'type':
        return flag.type;
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

  private getFlagsFileRouteSegments(): string[] | null {
    const params = this.route.snapshot.paramMap;
    const backendType = params.get('backendType');
    const backendUri = params.get('uri');
    const fileName = params.get('fileName');

    if (backendType && backendUri && fileName) {
      return ['/', backendType, backendUri, fileName];
    }

    const name = params.get('name');
    const backendId = params.get('backendId');
    if (!name) return null;

    if (backendId) {
      return ['/flags-files', 'remote', backendId, name];
    }

    return ['/flags-files', 'local', name];
  }
}
