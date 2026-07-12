import { Component, effect, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { MetadataMap } from '../../models/flag.models';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor';
import { EnvironmentManagerComponent } from '../environment-manager/environment-manager';
import { FlagStoreState } from '../../state/flag-store.state';
import { MetadataDto } from '../../services/flag-backend';
// import { CurrentFlagStoreState } from '../../state/current-flag-store.state';
// import { SetMetadata } from '../../state/current-flag-store.actions';

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
  readonly currentMetadata = this.ngxsStore.selectSignal(FlagStoreState.selectedCollectionMetadata);
  readonly flags = this.ngxsStore.selectSignal(FlagStoreState.flags);
  readonly environments = this.ngxsStore.selectSignal(FlagStoreState.environments);

  readonly projectMetadataDraft = signal<MetadataDto[]>([]);

  private readonly syncProjectMetadataDraft = effect(() => {
    this.projectMetadataDraft.set(this.currentMetadata());
  });

  onProjectMetadataChange(metadata: MetadataDto[]): void {
    this.projectMetadataDraft.set(metadata);
    // TODO:
    // this.ngxsStore.dispatch(new SetMetadata(metadata ?? {}));
  }
}
