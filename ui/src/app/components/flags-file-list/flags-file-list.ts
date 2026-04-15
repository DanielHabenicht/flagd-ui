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
import { DeleteCollection } from '../../state/flag-store.actions';
import { CollectionDto } from '../../services/flag-backend';

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

  readonly collections = this.ngxsStore.selectSignal(FlagStoreState.collections);

  openNewFlagsFileDialog(): void {
    this.dialog.open(NewFlagsFileDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
    });
  }

  getFlagsFileRoute(collection: CollectionDto): string[] {
    return ['/', 'uri', collection.name];
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
}
