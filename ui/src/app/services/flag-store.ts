import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FlagsService } from '../api-client/api/flags.service';
import { FlagDefinition, FlagEntry, FlagFileContent, inferFlagType } from '../models/flag.models';

@Injectable({ providedIn: 'root' })
export class FlagStore {
  private readonly flagsService = inject(FlagsService);
  private readonly router = inject(Router);

  readonly projects = signal<string[]>([]);
  readonly currentProjectName = signal<string | null>(null);
  readonly currentFlags = signal<Record<string, FlagDefinition> | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly flagEntries = computed<FlagEntry[]>(() => {
    const flags = this.currentFlags();
    if (!flags) return [];
    return Object.entries(flags).map(([key, def]) => ({ key, ...def }));
  });

  loadProjects(): void {
    this.loading.set(true);
    this.error.set(null);
    this.flagsService.listFlags().subscribe({
      next: (res) => {
        this.projects.set(res.files ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load projects');
        this.loading.set(false);
        console.error('Failed to load projects', err);
      },
    });
  }

  selectProject(name: string): void {
    this.currentProjectName.set(name);
    this.loading.set(true);
    this.error.set(null);
    this.flagsService.getFlag(name).subscribe({
      next: (res) => {
        const content = res as FlagFileContent;
        this.currentFlags.set(content.flags ?? {});
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(`Failed to load project "${name}"`);
        this.currentFlags.set(null);
        this.loading.set(false);
        console.error('Failed to load project', err);
      },
    });
  }

  createProject(name: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.flagsService.createFlag({ name, flags: {} }).subscribe({
      next: () => {
        this.loadProjects();
        this.router.navigate(['/projects', name]);
      },
      error: (err) => {
        this.error.set(`Failed to create project "${name}"`);
        this.loading.set(false);
        console.error('Failed to create project', err);
      },
    });
  }

  deleteProject(name: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.flagsService.deleteFlag(name).subscribe({
      next: () => {
        if (this.currentProjectName() === name) {
          this.currentProjectName.set(null);
          this.currentFlags.set(null);
          this.router.navigate(['/']);
        }
        this.loadProjects();
      },
      error: (err) => {
        this.error.set(`Failed to delete project "${name}"`);
        this.loading.set(false);
        console.error('Failed to delete project', err);
      },
    });
  }

  saveFlag(key: string, flag: FlagDefinition): void {
    const projectName = this.currentProjectName();
    if (!projectName) return;

    const current = this.currentFlags() ?? {};
    const updated = { ...current, [key]: flag };

    this.loading.set(true);
    this.error.set(null);
    this.flagsService.updateFlag(projectName, { flags: updated }).subscribe({
      next: () => {
        this.currentFlags.set(updated);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(`Failed to save flag "${key}"`);
        this.loading.set(false);
        console.error('Failed to save flag', err);
      },
    });
  }

  deleteFlag(key: string): void {
    const projectName = this.currentProjectName();
    if (!projectName) return;

    const current = this.currentFlags();
    if (!current) return;

    const updated = { ...current };
    delete updated[key];

    this.loading.set(true);
    this.error.set(null);
    this.flagsService.updateFlag(projectName, { flags: updated }).subscribe({
      next: () => {
        this.currentFlags.set(updated);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(`Failed to delete flag "${key}"`);
        this.loading.set(false);
        console.error('Failed to delete flag', err);
      },
    });
  }

  renameFlag(oldKey: string, newKey: string, flag: FlagDefinition): void {
    const projectName = this.currentProjectName();
    if (!projectName) return;

    const current = this.currentFlags() ?? {};
    const updated = { ...current };
    delete updated[oldKey];
    updated[newKey] = flag;

    this.loading.set(true);
    this.error.set(null);
    this.flagsService.updateFlag(projectName, { flags: updated }).subscribe({
      next: () => {
        this.currentFlags.set(updated);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(`Failed to rename flag "${oldKey}"`);
        this.loading.set(false);
        console.error('Failed to rename flag', err);
      },
    });
  }
}
