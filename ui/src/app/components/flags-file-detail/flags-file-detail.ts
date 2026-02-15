import { Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FlagStore } from '../../services/flag-store';
import { FlagEditorComponent } from '../flag-editor/flag-editor';
import { FlagDefinition, FlagEntry, inferFlagType } from '../../models/flag.models';
import { PlaygroundDrawerComponent } from '../playground-drawer/playground-drawer';

@Component({
  selector: 'app-flags-file-detail',
  standalone: true,
  imports: [
    FlagEditorComponent,
    PlaygroundDrawerComponent,
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
  readonly store = inject(FlagStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly inlineEditorMinWidth = 1280;
  private readonly keepEditorOpenAfterSaveMinWidth = 1920;
  private readonly initialWideLayout =
    typeof window !== 'undefined' && window.innerWidth >= this.inlineEditorMinWidth;
  private readonly routeSelectedFlagKey = signal<string | null>(null);

  showEditor = signal(this.initialWideLayout);
  editingFlag = signal<FlagEntry | null>(null);
  isWideLayout = signal(this.initialWideLayout);
  readonly selectedFlagKey = computed(() => this.editingFlag()?.key ?? null);
  readonly existingFlagKeys = computed(() => this.store.flagEntries().map((f) => f.key));
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
    const entries = this.store.flagEntries();
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

    const match = this.store.flagEntries().find((entry) => entry.key === selectedFlagKey);
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
  ): Array<{ value: string; count: number; variantNames: string[] }> {
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

    this.store.saveFlag(flag.key, updatedFlag);

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
        this.store.selectFlagsFileByRoute('remote', name, backendId ?? undefined);
      } else {
        this.store.selectFlagsFileByRoute('local', name);
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
    if (isWide) {
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
    this.showEditor.set(this.isWideLayout());
    this.editingFlag.set(null);
  }

  onSaveFlag(event: { key: string; flag: FlagDefinition; originalKey?: string }): void {
    if (event.originalKey && event.originalKey !== event.key) {
      this.store.renameFlag(event.originalKey, event.key, event.flag);
    } else {
      this.store.saveFlag(event.key, event.flag);
    }

    if (window.innerWidth >= this.keepEditorOpenAfterSaveMinWidth) {
      this.editingFlag.set({
        key: event.key,
        ...event.flag,
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
    this.store.deleteFlag(key);
  }

  downloadFlagsFile(): void {
    this.store.downloadCurrentFlagsFile();
  }

  openSettingsPage(): void {
    const name = this.route.snapshot.paramMap.get('name');
    if (!name) return;

    const backendId = this.route.snapshot.paramMap.get('backendId');
    if (backendId) {
      this.router.navigate(['/flags-files', 'remote', backendId, name, 'settings']);
      return;
    }

    this.router.navigate(['/flags-files', 'local', name, 'settings']);
  }

  private navigateToEditRoute(flagKey: string | null): void {
    const name = this.route.snapshot.paramMap.get('name');
    if (!name) return;

    const backendId = this.route.snapshot.paramMap.get('backendId');
    const targetFlagKey = flagKey ?? 'new';

    if (backendId) {
      this.router.navigate(['/flags-files', 'remote', backendId, name, 'edit', targetFlagKey]);
      return;
    }

    this.router.navigate(['/flags-files', 'local', name, 'edit', targetFlagKey]);
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
