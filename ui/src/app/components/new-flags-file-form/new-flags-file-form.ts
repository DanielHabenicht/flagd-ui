import { Component, Output, EventEmitter, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FileSystemAccess } from '../../services/file-system-access';
import { RestFlagBackend } from '../../services/rest-flag-backend';
import {
  CreateCollection,
  CreateServer,
  ImportSchema,
  SelectServer,
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
  private readonly router = inject(Router);
  private readonly remoteApi = inject(RestFlagBackend);
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
    return 'Connect';
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
    return 'cloud';
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
    this.addBackend();
  }

  useSample(sampleUrl: string): void {
    this.fileUrl = sampleUrl;
  }

  createEmptyFlagsFile(): void {
    const name = this.flagsFileName.trim();
    if (!name) return;
    this.store.dispatch(new CreateCollection(name));
    // void this.navigateToFlagsFile('local', .Browser, name);
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
          // Derive name from URL filename
          const urlPath = new URL(url).pathname;
          let name = urlPath.split('/').pop() ?? 'imported';
          name = name.replace(/\.flagd\.json$/, '').replace(/\.json$/, '');
          if (!name) name = 'imported';

          this.store.dispatch(new ImportSchema(name, text));
          // this.router.navigate(['/', "uri", backendUri, fileName]);

          // void this.navigateToFlagsFile('local', LocalBackendUris.Browser, name);
          this.formSubmitted.emit({ type: 'url' });
          this.urlLoading = false;
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

      this.store.dispatch(new ImportSchema(result.name, result.content));
      // void this.navigateToFlagsFile('local', LocalBackendUris.Disk, result.name);
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
    // Discovery not yet implemented
  }

  addBackend(): void {
    let url = this.backendUrl.trim().replace(/\/+$/, '');
    if (!url) return;
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    const label = this.backendLabel.trim() || url;

    this.store.dispatch(new CreateServer(label, url));
    this.store.dispatch(new SelectServer(url));
    this.formSubmitted.emit({ type: 'backend' });
  }

  private async navigateToFlagsFile(
    backendType: 'local' | 'remote',
    backendUri: string,
    fileName: string,
  ): Promise<void> {
    await this.router.navigate(['/', backendType, backendUri, fileName]);
  }
}
