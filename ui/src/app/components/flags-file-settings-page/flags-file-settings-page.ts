import { Component, computed, effect, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { MatButtonModule } from '@angular/material/button';
import { MetadataMap } from '../../models/flag.models';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor';
import { EnvironmentManagerComponent } from '../environment-manager/environment-manager';
import { CurrentFlagStoreState } from '../../state/current-flag-store.state';
import { SetMetadata } from '../../state/current-flag-store.actions';

@Component({
  selector: 'app-flags-file-settings-page',
  standalone: true,
  imports: [MatButtonModule, MetadataEditorComponent, EnvironmentManagerComponent],
  templateUrl: './flags-file-settings-page.html',
  styleUrl: './flags-file-settings-page.scss',
})
export class FlagsFileSettingsPageComponent {
  private readonly ngxsStore = inject(Store);

  // Selectors for template access
  readonly currentMetadata = this.ngxsStore.selectSignal(CurrentFlagStoreState.metadata);
  readonly flags = this.ngxsStore.selectSignal(CurrentFlagStoreState.flags);
  readonly environments = this.ngxsStore.selectSignal(CurrentFlagStoreState.environments);

  readonly projectMetadataDraft = signal<MetadataMap | undefined>(undefined);
  readonly projectMetadataDirty = computed(
    () =>
      this.metadataSnapshot(this.projectMetadataDraft()) !==
      this.metadataSnapshot(this.currentMetadata() as MetadataMap | undefined),
  );
  readonly metadataSaveDisabled = computed(() => !this.projectMetadataDirty());

  private readonly syncProjectMetadataDraft = effect(() => {
    this.projectMetadataDraft.set(this.currentMetadata() as MetadataMap | undefined);
  });

  onProjectMetadataChange(metadata: MetadataMap | undefined): void {
    this.projectMetadataDraft.set(metadata);
  }

  saveFlagsFileMetadata(): void {
    if (this.projectMetadataDraft()) {
      this.ngxsStore.dispatch(
        new SetMetadata(this.projectMetadataDraft() as Record<string, string | number | boolean>),
      );
    }
  }

  private metadataSnapshot(metadata: MetadataMap | undefined): string {
    if (!metadata || Object.keys(metadata).length === 0) return '';
    const sorted = Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(sorted);
  }
}
