import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { FlagStore } from '../../services/flag-store';
import { MetadataMap } from '../../models/flag.models';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor';
import { EnvironmentManagerComponent } from '../environment-manager/environment-manager';
import { PlaygroundDrawerComponent } from '../playground-drawer/playground-drawer';

@Component({
  selector: 'app-flags-file-settings-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MetadataEditorComponent,
    EnvironmentManagerComponent,
    PlaygroundDrawerComponent,
  ],
  templateUrl: './flags-file-settings-page.html',
  styleUrl: './flags-file-settings-page.scss',
})
export class FlagsFileSettingsPageComponent implements OnInit {
  readonly store = inject(FlagStore);
  private readonly route = inject(ActivatedRoute);

  readonly projectMetadataDraft = signal<MetadataMap | undefined>(undefined);
  readonly projectMetadataDirty = computed(
    () =>
      this.metadataSnapshot(this.projectMetadataDraft()) !==
      this.metadataSnapshot(this.store.currentMetadata()),
  );
  readonly metadataSaveDisabled = computed(
    () => this.store.loading() || !this.projectMetadataDirty(),
  );

  private readonly syncProjectMetadataDraft = effect(() => {
    this.projectMetadataDraft.set(this.store.currentMetadata());
  });

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
  }

  onProjectMetadataChange(metadata: MetadataMap | undefined): void {
    this.projectMetadataDraft.set(metadata);
  }

  saveFlagsFileMetadata(): void {
    this.store.saveFlagsFileMetadata(this.projectMetadataDraft());
  }

  private metadataSnapshot(metadata: MetadataMap | undefined): string {
    if (!metadata || Object.keys(metadata).length === 0) return '';
    const sorted = Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(sorted);
  }
}
