import { Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { FlagStore } from '../../services/flag-store';
import { BackendRegistry } from '../../services/backend-registry';
import { FlagEditorComponent } from '../flag-editor/flag-editor';
import { FlagDefinition, FlagEntry, inferFlagType } from '../../models/flag.models';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [FlagEditorComponent, MatTableModule, MatButtonModule, MatIconModule, MatChipsModule],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css',
})
export class ProjectDetailComponent implements OnInit {
  readonly store = inject(FlagStore);
  private readonly backendRegistry = inject(BackendRegistry);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly inlineEditorMinWidth = 1280;
  private readonly initialWideLayout = typeof window !== 'undefined' && window.innerWidth > this.inlineEditorMinWidth;
  private readonly routeFlagKey = signal<string | null>(null);

  showEditor = signal(this.initialWideLayout);
  editingFlag = signal<FlagEntry | null>(null);
  isWideLayout = signal(this.initialWideLayout);
  readonly selectedFlagKey = computed(() => this.editingFlag()?.key ?? null);
  readonly existingFlagKeys = computed(() => this.store.flagEntries().map((f) => f.key));
  readonly showInlineEditor = computed(() => this.showEditor() && this.isWideLayout());
  readonly showSidePanelEditor = computed(() => this.showEditor() && !this.isWideLayout());
  readonly displayedColumns = ['key', 'type', 'state', 'variants', 'default', 'targeting', 'actions'];
  readonly sourceBreadcrumb = computed(() => {
    const project = this.store.currentProject();
    if (!project) return null;

    if (project.source === 'local') {
      return 'Local Files';
    }

    const backend = this.backendRegistry
      .getBackends()
      .find((entry) => entry.url === project.backendUrl);
    const backendLabel = backend?.label ?? project.backendUrl ?? 'Unknown Backend';
    return `${backendLabel}`;
  });

  private readonly syncEditorWithRoute = effect(() => {
    const selectedKey = this.routeFlagKey();
    if (!selectedKey) {
      this.editingFlag.set(null);
      return;
    }

    const match = this.store.flagEntries().find((entry) => entry.key === selectedKey);
    if (!match) return;

    if (this.editingFlag()?.key !== match.key) {
      this.editingFlag.set(match);
    }
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
      if (routePath.startsWith('projects/remote')) {
        this.store.selectProjectByRoute('remote', name, backendId ?? undefined);
      } else {
        this.store.selectProjectByRoute('local', name);
      }
    });

    this.route.queryParamMap.subscribe((params) => {
      this.routeFlagKey.set(params.get('flag'));
    });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const isWide = window.innerWidth > this.inlineEditorMinWidth;
    this.isWideLayout.set(isWide);
    if (isWide) {
      this.showEditor.set(true);
    }
  }

  openNewFlagEditor(): void {
    this.updateSelectedFlagInUrl(null);
    this.editingFlag.set(null);
    this.showEditor.set(true);
  }

  openEditFlagEditor(flag: FlagEntry): void {
    this.updateSelectedFlagInUrl(flag.key);
    this.editingFlag.set(flag);
    this.showEditor.set(true);
  }

  closeEditor(): void {
    this.updateSelectedFlagInUrl(null);
    this.showEditor.set(this.isWideLayout());
    this.editingFlag.set(null);
  }

  onSaveFlag(event: { key: string; flag: FlagDefinition; originalKey?: string }): void {
    if (event.originalKey && event.originalKey !== event.key) {
      this.store.renameFlag(event.originalKey, event.key, event.flag);
    } else {
      this.store.saveFlag(event.key, event.flag);
    }
    this.closeEditor();
  }

  onDeleteFlag(key: string): void {
    if (this.editingFlag()?.key === key) {
      this.closeEditor();
    }
    this.store.deleteFlag(key);
  }

  downloadProject(): void {
    this.store.downloadCurrentProject();
  }

  private updateSelectedFlagInUrl(flagKey: string | null): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { flag: flagKey },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
