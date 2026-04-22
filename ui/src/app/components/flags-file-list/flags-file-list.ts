import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngxs/store';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { NewFlagsFileDialogComponent } from '../new-flags-file-dialog/new-flags-file-dialog';
import { FlagStoreState } from '../../state/flag-store.state';
import { DeleteCollection, SelectServer } from '../../state/flag-store.actions';
import { CollectionDto, FLAG_BACKEND } from '../../services/flag-backend';
import { ENVIRONMENT } from '../../../environments';

@Component({
  selector: 'app-flags-file-list',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
  ],
  templateUrl: './flags-file-list.html',
  styleUrl: './flags-file-list.scss',
})
export class FlagsFileListComponent {
  private readonly ngxsStore = inject(Store);
  private readonly dialog = inject(MatDialog);
  private readonly backend = inject(FLAG_BACKEND);

  readonly collections = this.ngxsStore.selectSignal(FlagStoreState.collections);
  readonly serverEntries = this.ngxsStore.selectSignal(FlagStoreState.serverEntries);
  readonly selectedServerUri = this.ngxsStore.selectSignal(FlagStoreState.selectedServerUri);
  readonly canExportDatabase =
    ENVIRONMENT === 'development' && typeof this.backend.exportDatabase === 'function';

  openNewFlagsFileDialog(): void {
    this.dialog.open(NewFlagsFileDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
    });
  }

  getFlagsFileRoute(collection: CollectionDto): string[] {
    return ['/', 'local', collection.id.toString()];
  }

  selectServer(uri: string): void {
    this.ngxsStore.dispatch(new SelectServer(uri));
  }

  deleteCollection(event: Event, collection: CollectionDto): void {
    event.preventDefault();
    event.stopPropagation();
    if (
      confirm(`Delete flags-file "${collection.name}"? This will remove all flags in this file.`)
    ) {
      this.ngxsStore.dispatch(new DeleteCollection(collection.id));
    }
  }

  async downloadDatabase(): Promise<void> {
    if (!this.backend.exportDatabase) return;
    const bytes = await this.backend.exportDatabase();
    if (!bytes) return;
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flagd-ui.db';
    a.click();
    URL.revokeObjectURL(url);
  }

  async purgeDatabase(): Promise<void> {
    if (!this.backend.purgeDatabase) return;
    await this.backend.purgeDatabase();
    window.location.reload();
  }
}
