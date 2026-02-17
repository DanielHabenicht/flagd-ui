import { Component, effect, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { MetadataMap } from '../../models/flag.models';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor';
import { EnvironmentManagerComponent } from '../environment-manager/environment-manager';
import { CurrentFlagStoreState } from '../../state/current-flag-store.state';
import { SetMetadata } from '../../state/current-flag-store.actions';

@Component({
  selector: 'app-flags-file-settings-page',
  standalone: true,
  imports: [MetadataEditorComponent, EnvironmentManagerComponent],
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

  private readonly syncProjectMetadataDraft = effect(() => {
    this.projectMetadataDraft.set(this.currentMetadata() as MetadataMap | undefined);
  });

  onProjectMetadataChange(metadata: MetadataMap | undefined): void {
    this.projectMetadataDraft.set(metadata);
    this.ngxsStore.dispatch(new SetMetadata(metadata ?? {}));
  }
}
