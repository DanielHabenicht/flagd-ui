import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { PlaygroundServer } from './playground-drawer';

interface PlaygroundServerDialogData {
  servers: PlaygroundServer[];
  activeServerId: string | null;
}

export interface PlaygroundServerDialogResult {
  servers: PlaygroundServer[];
  activeServerId: string | null;
}

@Component({
  selector: 'app-playground-server-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
  ],
  templateUrl: './playground-server-dialog.html',
  styleUrl: './playground-server-dialog.scss',
})
export class PlaygroundServerDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<PlaygroundServerDialogComponent>);
  private readonly data = inject<PlaygroundServerDialogData>(MAT_DIALOG_DATA);

  readonly servers: PlaygroundServer[] = this.data.servers.map((server) => ({ ...server }));
  activeServerId: string | null = this.data.activeServerId;
  editingServerId: string | null = null;

  readonly form = new FormGroup({
    provider: new FormControl<'flagd' | 'ofrep'>('flagd', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    url: new FormControl<string>('https://localhost:8013', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  formError = '';

  addOrUpdateServer(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rawUrl = this.form.controls.url.value.trim();
    const normalizedUrl = this.normalizeUrl(rawUrl);
    if (!normalizedUrl) {
      this.formError = 'Enter a valid URL, e.g. https://localhost:8013/flagd-api';
      return;
    }

    this.formError = '';

    if (this.editingServerId) {
      const index = this.servers.findIndex((server) => server.id === this.editingServerId);
      if (index !== -1) {
        this.servers[index] = {
          ...this.servers[index],
          provider: this.form.controls.provider.value,
          url: normalizedUrl,
        };
      }
      this.editingServerId = null;
      this.form.reset({ provider: 'flagd', url: 'https://localhost:8013' });
      return;
    }

    const server: PlaygroundServer = {
      id: this.generateId(),
      provider: this.form.controls.provider.value,
      url: normalizedUrl,
    };

    this.servers.push(server);
    this.activeServerId = server.id;
  }

  removeServer(serverId: string): void {
    const index = this.servers.findIndex((server) => server.id === serverId);
    if (index === -1) return;

    this.servers.splice(index, 1);

    if (this.editingServerId === serverId) {
      this.editingServerId = null;
      this.form.reset({ provider: 'flagd', url: 'https://localhost:8013' });
      this.formError = '';
    }

    if (this.activeServerId === serverId) {
      this.activeServerId = this.servers[0]?.id ?? null;
    }
  }

  editServer(serverId: string): void {
    const server = this.servers.find((entry) => entry.id === serverId);
    if (!server) return;

    this.editingServerId = server.id;
    this.form.patchValue({ provider: server.provider, url: server.url });
    this.formError = '';
  }

  cancelEdit(): void {
    this.editingServerId = null;
    this.form.reset({ provider: 'flagd', url: 'https://localhost:8013' });
    this.formError = '';
  }

  setActiveServer(serverId: string): void {
    this.activeServerId = serverId;
  }

  save(): void {
    this.dialogRef.close({
      servers: this.servers,
      activeServerId: this.activeServerId,
    } satisfies PlaygroundServerDialogResult);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private normalizeUrl(rawUrl: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return null;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${parsed.hostname}${port}${path}`;
  }
}
