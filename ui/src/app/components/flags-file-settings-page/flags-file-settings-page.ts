import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngxs/store';
import { MatButtonModule } from '@angular/material/button';
import { MetadataMap } from '../../models/flag.models';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor';
import { EnvironmentManagerComponent } from '../environment-manager/environment-manager';
import { FlagStoreState } from '../../state/current-flag-store.state';
import { SelectFlagsFileByRoute, SaveFlagsFileMetadata } from '../../state/current-flag-store.actions';

@Component({
  selector: 'app-flags-file-settings-page',
  standalone: true,
  imports: [MatButtonModule, MetadataEditorComponent, EnvironmentManagerComponent],
  templateUrl: './flags-file-settings-page.html',
  styleUrl: './flags-file-settings-page.scss',
})
export class FlagsFileSettingsPageComponent implements OnInit {
  private readonly ngxsStore = inject(Store);
  private readonly route = inject(ActivatedRoute);

  // Selectors for template access
  readonly error = this.ngxsStore.selectSignal(FlagStoreState.error);
  readonly flagEntries = this.ngxsStore.selectSignal(FlagStoreState.flagEntries);
  readonly currentEvaluators = this.ngxsStore.selectSignal(FlagStoreState.currentEvaluators);
  readonly currentMetadata = this.ngxsStore.selectSignal(FlagStoreState.currentMetadata);
  readonly loading = this.ngxsStore.selectSignal(FlagStoreState.loading);

  readonly projectMetadataDraft = signal<MetadataMap | undefined>(undefined);
  readonly projectMetadataDirty = computed(
    () =>
      this.metadataSnapshot(this.projectMetadataDraft()) !==
      this.metadataSnapshot(this.currentMetadata()),
  );
  readonly metadataSaveDisabled = computed(() => this.loading() || !this.projectMetadataDirty());

  private readonly syncProjectMetadataDraft = effect(() => {
    this.projectMetadataDraft.set(this.currentMetadata());
  });

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
  }

  onProjectMetadataChange(metadata: MetadataMap | undefined): void {
    this.projectMetadataDraft.set(metadata);
  }

  saveFlagsFileMetadata(): void {
    this.ngxsStore.dispatch(new SaveFlagsFileMetadata(this.projectMetadataDraft()));
  }

  private metadataSnapshot(metadata: MetadataMap | undefined): string {
    if (!metadata || Object.keys(metadata).length === 0) return '';
    const sorted = Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(sorted);
  }
}
