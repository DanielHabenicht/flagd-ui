import { Component, Output, EventEmitter, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngxs/store';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { BackendRegistry } from '../../services/backend-registry';
import { RemoteApi } from '../../services/remote-api';
import { FlagFileContent } from '../../models/flag.models';
import { FileSystemAccess } from '../../services/file-system-access';
import {
  CreateLocalFlagsFile,
  ImportLocalFlagsFile,
  LoadFlagsFiles,
} from '../../state/flag-store.actions';

export interface NewFlagsFileFormResult {
  type: 'empty' | 'url' | 'disk' | 'backend';
}

@Component({
  selector: 'app-new-flags-file-form',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTabsModule,
    MatProgressBarModule,
  ],
  templateUrl: './new-flags-file-form.html',
  styleUrl: './new-flags-file-form.scss',
})
export class NewFlagsFileFormComponent {
  @Output() formSubmitted = new EventEmitter<NewFlagsFileFormResult>();

  private readonly store = inject(Store);
  private readonly http = inject(HttpClient);
  private readonly backendRegistry = inject(BackendRegistry);
  private readonly remoteApi = inject(RemoteApi);
  private readonly fileSystemAccess = inject(FileSystemAccess);

  // Empty flags-file tab
  flagsFileName = '';

  // From URL tab
  fileUrl = '';
  urlLoading = false;
  urlError = '';

  // Tabs
  selectedTabIndex = 0;

  // From disk tab
  diskLoading = false;
  diskError = '';
  readonly supportsDiskPicker = this.fileSystemAccess.isOpenFilePickerSupported();

  readonly sampleFiles = [
    {
      name: 'example_flags.flagd.2.json',
      githubUrl:
        'https://github.com/open-feature/flagd/blob/main/config/samples/example_flags.flagd.2.json',
      rawUrl:
        'https://raw.githubusercontent.com/open-feature/flagd/main/config/samples/example_flags.flagd.2.json',
    },
    {
      name: 'example_flags.flagd.json',
      githubUrl:
        'https://github.com/open-feature/flagd/blob/main/config/samples/example_flags.flagd.json',
      rawUrl:
        'https://raw.githubusercontent.com/open-feature/flagd/main/config/samples/example_flags.flagd.json',
    },
    {
      name: 'example_flags.json',
      githubUrl:
        'https://github.com/open-feature/flagd/blob/main/config/samples/example_flags.json',
      rawUrl:
        'https://raw.githubusercontent.com/open-feature/flagd/main/config/samples/example_flags.json',
    },
    {
      name: 'example_flags_secondary.flagd.json',
      githubUrl:
        'https://github.com/open-feature/flagd/blob/main/config/samples/example_flags_secondary.flagd.json',
      rawUrl:
        'https://raw.githubusercontent.com/open-feature/flagd/main/config/samples/example_flags_secondary.flagd.json',
    },
    {
      name: 'example_flags_secondary.json',
      githubUrl:
        'https://github.com/open-feature/flagd/blob/main/config/samples/example_flags_secondary.json',
      rawUrl:
        'https://raw.githubusercontent.com/open-feature/flagd/main/config/samples/example_flags_secondary.json',
    },
  ];

  // Backend tab
  backendUrl = '';
  backendLabel = '';
  backendLoading = false;
  backendError = '';
  discoveredFiles: string[] = [];

  get actionLabel(): string {
    if (this.selectedTabIndex === 0) {
      return 'Create';
    }
    if (this.selectedTabIndex === 1) {
      return 'Import';
    }
    if (this.selectedTabIndex === 2) {
      return 'Open';
    }
    return this.discoveredFiles.length ? 'Create' : 'Discover';
  }

  get actionIcon(): string {
    if (this.selectedTabIndex === 0) {
      return 'add';
    }
    if (this.selectedTabIndex === 1) {
      return 'download';
    }
    if (this.selectedTabIndex === 2) {
      return 'folder_open';
    }
    return this.discoveredFiles.length ? 'cloud' : 'search';
  }

  get actionDisabled(): boolean {
    if (this.selectedTabIndex === 0) {
      return !this.flagsFileName.trim();
    }
    if (this.selectedTabIndex === 1) {
      return !this.fileUrl.trim() || this.urlLoading;
    }
    if (this.selectedTabIndex === 2) {
      return this.diskLoading || !this.supportsDiskPicker;
    }
    return !this.backendUrl.trim() || this.backendLoading;
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
  }

  onPrimaryAction(): void {
    if (this.selectedTabIndex === 0) {
      this.createEmptyFlagsFile();
      return;
    }
    if (this.selectedTabIndex === 1) {
      this.importFromUrl();
      return;
    }
    if (this.selectedTabIndex === 2) {
      void this.importFromDisk();
      return;
    }
    if (this.discoveredFiles.length) {
      this.addBackend();
      return;
    }
    this.discoverBackend();
  }

  useSample(sampleUrl: string): void {
    this.fileUrl = sampleUrl;
  }

  createEmptyFlagsFile(): void {
    const name = this.flagsFileName.trim();
    if (!name) return;
    this.store.dispatch(new CreateLocalFlagsFile(name));
    this.formSubmitted.emit({ type: 'empty' });
  }

  importFromUrl(): void {
    const url = this.fileUrl.trim();
    if (!url) return;

    this.urlLoading = true;
    this.urlError = '';

    this.http.get(url, { responseType: 'text' }).subscribe({
      next: (text) => {
        try {
          const content = JSON.parse(text) as FlagFileContent;
          if (!content.flags || typeof content.flags !== 'object') {
            this.urlError = 'Invalid flag file: missing "flags" property';
            this.urlLoading = false;
            return;
          }
          // Derive name from URL filename
          const urlPath = new URL(url).pathname;
          let name = urlPath.split('/').pop() ?? 'imported';
          name = name.replace(/\.flagd\.json$/, '').replace(/\.json$/, '');
          if (!name) name = 'imported';

          this.store.dispatch(new ImportLocalFlagsFile(name, content));
          this.formSubmitted.emit({ type: 'url' });
        } catch {
          this.urlError = 'Failed to parse JSON file';
          this.urlLoading = false;
        }
      },
      error: () => {
        this.urlError = 'Failed to fetch file from URL';
        this.urlLoading = false;
      },
    });
  }

  async importFromDisk(): Promise<void> {
    if (!this.supportsDiskPicker) {
      this.diskError = 'This browser does not support direct disk file access.';
      return;
    }

    this.diskLoading = true;
    this.diskError = '';

    try {
      const result = await this.fileSystemAccess.pickAndBindFlagsFile();
      if (!result) {
        this.diskLoading = false;
        return;
      }

      this.store.dispatch(new ImportLocalFlagsFile(result.name, result.content, 'disk'));
      this.formSubmitted.emit({ type: 'disk' });
    } catch (error) {
      this.diskLoading = false;

      const message = error instanceof Error ? error.message : 'Failed to open local file';
      if (message.includes('aborted') || message.includes('The user aborted a request')) {
        return;
      }

      this.diskError = message;
    }
  }

  discoverBackend(): void {
    let url = this.backendUrl.trim();
    if (!url) return;
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    url = url.replace(/\/+$/, '');

    this.backendLoading = true;
    this.backendError = '';
    this.discoveredFiles = [];

    this.remoteApi.listFlagsFiles(url).subscribe({
      next: (files) => {
        queueMicrotask(() => {
          this.discoveredFiles = files;
          this.backendLoading = false;
          if (files.length === 0) {
            this.backendError = 'No flag files found on this backend';
          }
        });
      },
      error: () => {
        queueMicrotask(() => {
          this.backendError = 'Failed to connect to backend. Ensure CORS is enabled.';
          this.backendLoading = false;
        });
      },
    });
  }

  addBackend(): void {
    let url = this.backendUrl.trim().replace(/\/+$/, '');
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    const label = this.backendLabel.trim() || undefined;
    this.backendRegistry.addBackend(url, label);
    this.store.dispatch(new LoadFlagsFiles());
    this.formSubmitted.emit({ type: 'backend' });
  }
}
