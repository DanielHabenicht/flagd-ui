import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngxs/store';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { NewFlagsFileDialogComponent } from '../new-flags-file-dialog/new-flags-file-dialog';
import { FlagFileStore, Backend } from '../../state/flag-file-store.state';
import { BackendType, RemoveBackend, RemoveFile } from '../../state/flag-file-store.actions';

interface FlagsFileListEntry {
  name: string;
  backendType: BackendType;
  backendUri: string;
}

interface FlagsFileGroup {
  label: string;
  icon: string;
  entries: FlagsFileListEntry[];
  backendType: BackendType;
  backendUri: string;
  canRemove: boolean;
}

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

  readonly localBackends = this.ngxsStore.selectSignal(FlagFileStore.backendsByType('local'));
  readonly remoteBackends = this.ngxsStore.selectSignal(FlagFileStore.backendsByType('remote'));
  readonly fileGroups = computed(() => {
    const groups: FlagsFileGroup[] = [];

    const toEntries = (backend: Backend, backendType: BackendType): FlagsFileListEntry[] =>
      backend.files.map((file) => ({
        name: file.name,
        backendType,
        backendUri: backend.uri,
      }));

    for (const backend of this.localBackends()) {
      const entries = toEntries(backend, 'local');
      if (!entries.length) continue;
      groups.push({
        label: backend.label,
        icon: 'folder',
        entries,
        backendType: 'local',
        backendUri: backend.uri,
        canRemove: false,
      });
    }

    for (const backend of this.remoteBackends()) {
      const entries = toEntries(backend, 'remote');
      if (!entries.length) continue;
      groups.push({
        label: backend.label,
        icon: 'cloud',
        entries,
        backendType: 'remote',
        backendUri: backend.uri,
        canRemove: true,
      });
    }

    return groups;
  });
  readonly hasFiles = computed(() => this.fileGroups().some((group) => group.entries.length > 0));

  openNewFlagsFileDialog(): void {
    this.dialog.open(NewFlagsFileDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
    });
  }

  getFlagsFileRoute(flagsFile: FlagsFileListEntry): string[] {
    return ['/', flagsFile.backendType, flagsFile.backendUri, flagsFile.name];
  }

  deleteFlagsFile(event: Event, flagsFile: FlagsFileListEntry): void {
    event.preventDefault();
    event.stopPropagation();
    if (
      confirm(`Delete flags-file "${flagsFile.name}"? This will remove all flags in this file.`)
    ) {
      this.ngxsStore.dispatch(
        new RemoveFile(flagsFile.backendType, flagsFile.backendUri, flagsFile.name),
      );
    }
  }

  removeBackend(
    event: Event,
    backendType: BackendType,
    backendUri: string,
    backendLabel: string,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (confirm(`Remove backend "${backendLabel}" from navigation?`)) {
      this.ngxsStore.dispatch(new RemoveBackend(backendType, backendUri));
    }
  }
}
