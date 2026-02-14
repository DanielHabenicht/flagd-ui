import { Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
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
  readonly displayedColumns = [
    'key',
    'type',
    'state',
    'variants',
    'default',
    'targeting',
    'actions',
  ];

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

  hasTargeting(flag: FlagEntry): boolean {
    return !!flag.targeting && Object.keys(flag.targeting).length > 0;
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
}
