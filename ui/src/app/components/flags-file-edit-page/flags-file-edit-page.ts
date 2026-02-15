import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FlagEditorComponent } from '../flag-editor/flag-editor';
import { PlaygroundDrawerComponent } from '../playground-drawer/playground-drawer';
import { FlagStore } from '../../services/flag-store';
import { FlagDefinition, FlagEntry } from '../../models/flag.models';

@Component({
  selector: 'app-flags-file-edit-page',
  standalone: true,
  imports: [FlagEditorComponent, PlaygroundDrawerComponent],
  templateUrl: './flags-file-edit-page.html',
  styleUrl: './flags-file-edit-page.scss',
})
export class FlagsFileEditPageComponent implements OnInit {
  readonly store = inject(FlagStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly keepEditorOpenAfterSaveMinWidth = 1920;

  private readonly routeFlagKey = signal<string | null>(null);

  editingFlag = signal<FlagEntry | null>(null);
  readonly existingFlagKeys = computed(() => this.store.flagEntries().map((f) => f.key));
  readonly selectedFlagKey = computed(() => {
    const editingKey = this.editingFlag()?.key;
    if (editingKey) return editingKey;

    const routeKey = this.routeFlagKey();
    return routeKey && routeKey !== 'new' ? routeKey : null;
  });

  private readonly syncEditingFlagFromRoute = effect(() => {
    const flagKey = this.routeFlagKey();
    if (!flagKey || flagKey === 'new') {
      this.editingFlag.set(null);
      return;
    }

    const match = this.store.flagEntries().find((entry) => entry.key === flagKey);
    this.editingFlag.set(match ?? null);
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const name = params.get('name');
      const backendId = params.get('backendId');
      const flagKey = params.get('flagKey');

      if (!name) return;

      const routePath = this.route.snapshot.routeConfig?.path ?? '';
      if (routePath.startsWith('flags-files/remote')) {
        this.store.selectFlagsFileByRoute('remote', name, backendId ?? undefined);
      } else {
        this.store.selectFlagsFileByRoute('local', name);
      }

      this.routeFlagKey.set(flagKey);
    });
  }

  onSaveFlag(event: { key: string; flag: FlagDefinition; originalKey?: string }): void {
    if (event.originalKey && event.originalKey !== event.key) {
      this.store.renameFlag(event.originalKey, event.key, event.flag);
    } else {
      this.store.saveFlag(event.key, event.flag);
    }

    if (window.innerWidth < this.keepEditorOpenAfterSaveMinWidth) {
      this.navigateToDetailRoute();
      return;
    }

    this.editingFlag.set({
      key: event.key,
      ...event.flag,
    });

    this.navigateToEditRoute(event.key);
  }

  onCancel(): void {
    this.navigateToDetailRoute();
  }

  onUnexpand(): void {
    this.navigateToDetailRoute(this.selectedFlagKey());
  }

  private navigateToDetailRoute(flagKey: string | null = null): void {
    const name = this.route.snapshot.paramMap.get('name');
    if (!name) return;

    const backendId = this.route.snapshot.paramMap.get('backendId');
    if (backendId) {
      this.router.navigate(['/flags-files', 'remote', backendId, name], {
        queryParams: { flag: flagKey },
      });
      return;
    }

    this.router.navigate(['/flags-files', 'local', name], {
      queryParams: { flag: flagKey },
    });
  }

  private navigateToEditRoute(flagKey: string): void {
    const name = this.route.snapshot.paramMap.get('name');
    if (!name) return;

    const backendId = this.route.snapshot.paramMap.get('backendId');
    if (backendId) {
      this.router.navigate(['/flags-files', 'remote', backendId, name, 'edit', flagKey]);
      return;
    }

    this.router.navigate(['/flags-files', 'local', name, 'edit', flagKey]);
  }
}
