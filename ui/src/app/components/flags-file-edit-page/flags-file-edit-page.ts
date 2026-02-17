import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngxs/store';
import { Navigate } from '@ngxs/router-plugin';
import { FlagEditorComponent } from '../flag-editor/flag-editor';
import { DisplayFlag } from '../../models/abstraction/flagd-abstraction-models';
import { CurrentFlagStoreState } from '../../state/current-flag-store.state';
import { LoadFlagFile, CreateOrUpdateFlag } from '../../state/current-flag-store.actions';

@Component({
  selector: 'app-flags-file-edit-page',
  standalone: true,
  imports: [FlagEditorComponent],
  templateUrl: './flags-file-edit-page.html',
  styleUrl: './flags-file-edit-page.scss',
})
export class FlagsFileEditPageComponent implements OnInit {
  private readonly ngxsStore = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly keepEditorOpenAfterSaveMinWidth = 1920;

  private readonly routeFlagKey = signal<string | null>(null);

  readonly flagEntries = this.ngxsStore.selectSignal(CurrentFlagStoreState.flags);

  editingFlag = signal<DisplayFlag | null>(null);
  readonly editingDisplayFlag = computed(() => this.editingFlag());
  readonly existingFlagKeys = computed(() => this.flagEntries().map((f) => f.key));
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

    const match = this.flagEntries().find((entry) => entry.key === flagKey);
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
        this.ngxsStore.dispatch(new LoadFlagFile('remote', backendId ?? '', name));
      } else {
        this.ngxsStore.dispatch(new LoadFlagFile('local', 'disk', name));
      }

      this.routeFlagKey.set(flagKey);
    });
  }

  onSaveFlag(event: { key: string; flag: DisplayFlag; originalKey?: string }): void {
    const updatedFlag: DisplayFlag = {
      ...event.flag,
      key: event.key,
    };

    this.ngxsStore.dispatch(new CreateOrUpdateFlag(updatedFlag, event.originalKey));

    if (window.innerWidth < this.keepEditorOpenAfterSaveMinWidth) {
      this.navigateToDetailRoute();
      return;
    }

    // Navigate to the edit route for the newly saved flag
    // The component will automatically update via the route effect
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
      this.ngxsStore.dispatch(
        new Navigate(
          ['/flags-files', 'remote', backendId, name],
          {
            flag: flagKey,
          },
          {
            queryParamsHandling: 'merge',
          },
        ),
      );
      return;
    }

    this.ngxsStore.dispatch(
      new Navigate(
        ['/flags-files', 'local', name],
        {
          flag: flagKey,
        },
        {
          queryParamsHandling: 'merge',
        },
      ),
    );
  }

  private navigateToEditRoute(flagKey: string): void {
    const name = this.route.snapshot.paramMap.get('name');
    if (!name) return;

    const backendId = this.route.snapshot.paramMap.get('backendId');
    if (backendId) {
      this.ngxsStore.dispatch(
        new Navigate(['/flags-files', 'remote', backendId, name, 'edit', flagKey], undefined, {
          queryParamsHandling: 'merge',
        }),
      );
      return;
    }

    this.ngxsStore.dispatch(
      new Navigate(['/flags-files', 'local', name, 'edit', flagKey], undefined, {
        queryParamsHandling: 'merge',
      }),
    );
  }
}
