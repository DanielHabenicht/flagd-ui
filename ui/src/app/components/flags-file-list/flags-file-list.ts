import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { FlagStore } from '../../services/flag-store';
import { BackendRegistry } from '../../services/backend-registry';
import { FlagsFileEntry } from '../../models/flag.models';
import { NewFlagsFileDialogComponent } from '../new-flags-file-dialog/new-flags-file-dialog';

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
  readonly store = inject(FlagStore);
  private readonly dialog = inject(MatDialog);
  private readonly backendRegistry = inject(BackendRegistry);

  ngOnInit(): void {
    // Auto-detect same-origin backend and register it
    this.backendRegistry.probeDefaultBackend().subscribe((available) => {
      this.store.setHasDefaultBackend(available);
      if (available) {
        this.backendRegistry.addBackend('', 'This Server');
      }
      this.store.loadFlagsFiles();
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
      this.store.deleteFlagsFile(flagsFile);
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
