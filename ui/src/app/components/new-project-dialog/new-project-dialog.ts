import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FlagStore } from '../../services/flag-store';
import { BackendRegistry } from '../../services/backend-registry';
import { RemoteApi } from '../../services/remote-api';
import { FlagFileContent } from '../../models/flag.models';

@Component({
  selector: 'app-new-project-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTabsModule,
    MatProgressBarModule,
  ],
  templateUrl: './new-project-dialog.html',
  styleUrl: './new-project-dialog.css',
})
export class NewProjectDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<NewProjectDialogComponent>);
  private readonly store = inject(FlagStore);
  private readonly http = inject(HttpClient);
  private readonly backendRegistry = inject(BackendRegistry);
  private readonly remoteApi = inject(RemoteApi);

  // Empty project tab
  projectName = '';

  // From URL tab
  fileUrl = '';
  urlLoading = false;
  urlError = '';

  // Backend tab
  backendUrl = '';
  backendLabel = '';
  backendLoading = false;
  backendError = '';
  discoveredFiles: string[] = [];

  createEmptyProject(): void {
    const name = this.projectName.trim();
    if (!name) return;
    this.store.createLocalProject(name);
    this.dialogRef.close();
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

          this.store.importLocalProject(name, content);
          this.dialogRef.close();
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

    this.remoteApi.listProjects(url).subscribe({
      next: (files) => {
        this.discoveredFiles = files;
        this.backendLoading = false;
        if (files.length === 0) {
          this.backendError = 'No flag files found on this backend';
        }
      },
      error: () => {
        this.backendError = 'Failed to connect to backend. Ensure CORS is enabled.';
        this.backendLoading = false;
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
    this.store.loadProjects();
    this.dialogRef.close();
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
