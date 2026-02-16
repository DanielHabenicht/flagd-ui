import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngxs/store';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { BackendRegistry } from '../../services/backend-registry';
import { FlagsFileEntry } from '../../models/flag.models';
import { NewFlagsFileDialogComponent } from '../new-flags-file-dialog/new-flags-file-dialog';
import { FlagStoreState } from '../../state/current-flag-store.state';
import { SetHasDefaultBackend, LoadFlagsFiles, DeleteFlagsFile } from '../../state/current-flag-store.actions';

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
export class FlagsFileListComponent implements OnInit {
  private readonly ngxsStore = inject(Store);
  private readonly dialog = inject(MatDialog);
  private readonly backendRegistry = inject(BackendRegistry);

  readonly fileGroups = this.ngxsStore.selectSignal(FlagStoreState.fileGroups);
  readonly loading = this.ngxsStore.selectSignal(FlagStoreState.loading);

  ngOnInit(): void {
    // Auto-detect same-origin backend and register it
    this.backendRegistry.probeDefaultBackend().subscribe((available) => {
      this.ngxsStore.dispatch(new SetHasDefaultBackend(available));
      if (available) {
        this.backendRegistry.addBackend('', 'This Server');
      }
      this.ngxsStore.dispatch(new LoadFlagsFiles());
    });
  }

  openNewFlagsFileDialog(): void {
    this.dialog.open(NewFlagsFileDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
    });
  }

  getFlagsFileRoute(flagsFile: FlagsFileEntry): string[] {
    if (flagsFile.source === 'local') {
      return ['/flags-files', 'local', flagsFile.name];
    }
    const backend = this.backendRegistry
      .getBackends()
      .find((entry) => entry.url === flagsFile.backendUrl);
    return ['/flags-files', 'remote', backend?.id ?? '', flagsFile.name];
  }

  deleteFlagsFile(event: Event, flagsFile: FlagsFileEntry): void {
    event.preventDefault();
    event.stopPropagation();
    if (
      confirm(`Delete flags-file "${flagsFile.name}"? This will remove all flags in this file.`)
    ) {
      this.ngxsStore.dispatch(new DeleteFlagsFile(flagsFile));
    }
  }

  removeBackend(event: Event, backendId: string, backendLabel: string): void {
    event.preventDefault();
    event.stopPropagation();

    if (confirm(`Remove backend "${backendLabel}" from navigation?`)) {
      this.backendRegistry.removeBackend(backendId);
    }
  }
}
