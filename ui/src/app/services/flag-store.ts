import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { LocalStore } from './local-store';
import { RemoteApi } from './remote-api';
import { BackendRegistry } from './backend-registry';
import {
  FlagDefinition,
  FlagEntry,
  FlagFileContent,
  FileGroup,
  MetadataMap,
  ProjectEntry,
  Environment,
  Evaluator,
  extractEnvironments,
} from '../models/flag.models';

@Injectable({ providedIn: 'root' })
export class FlagStore {
  private readonly localStore = inject(LocalStore);
  private readonly remoteApi = inject(RemoteApi);
  private readonly backendRegistry = inject(BackendRegistry);
  private readonly router = inject(Router);

  readonly projects = signal<ProjectEntry[]>([]);
  readonly currentProject = signal<ProjectEntry | null>(null);
  readonly currentFlags = signal<Record<string, FlagDefinition> | null>(null);
  readonly currentEvaluators = signal<Record<string, Evaluator> | undefined>(undefined);
  readonly currentMetadata = signal<MetadataMap | undefined>(undefined);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Tracks whether same-origin backend is available */
  readonly hasDefaultBackend = signal(false);

  readonly currentProjectName = computed(() => this.currentProject()?.name ?? null);

  readonly currentEnvironments = computed<Environment[]>(() => {
    const evaluators = this.currentEvaluators();
    return extractEnvironments(evaluators);
  });

  readonly flagEntries = computed<FlagEntry[]>(() => {
    const flags = this.currentFlags();
    if (!flags) return [];
    return Object.entries(flags).map(([key, def]) => ({ key, ...def }));
  });

  readonly fileGroups = computed<FileGroup[]>(() => {
    const all = this.projects();
    const groups: FileGroup[] = [];

    const backends = this.backendRegistry.getBackends();

    // Group remote files first
    for (const backend of backends) {
      const entries = all.filter((p) => p.source === 'remote' && p.backendUrl === backend.url);
      if (entries.length > 0) {
        groups.push({
          label: backend.label,
          icon: 'cloud',
          backendId: backend.id,
          entries,
        });
      }
    }

    // Local files group
    const localEntries = all.filter((p) => p.source === 'local');
    if (localEntries.length > 0) {
      groups.push({ label: 'Local Files', icon: 'computer', entries: localEntries });
    }

    return groups;
  });

  loadProjects(): void {
    this.loading.set(true);
    this.error.set(null);

    // Gather local projects
    const localNames = this.localStore.listProjects();
    const localEntries: ProjectEntry[] = localNames.map((name) => ({
      name,
      source: 'local' as const,
    }));

    // Gather remote projects from all registered backends
    const backends = this.backendRegistry.getBackends();
    if (backends.length === 0) {
      this.projects.set(localEntries);
      this.loading.set(false);
      return;
    }

    const remoteRequests = backends.map((backend) =>
      this.remoteApi.listProjects(backend.url).pipe(
        catchError((err) => {
          console.error(`Failed to load projects from ${backend.url}`, err);
          return of([] as string[]);
        }),
      ),
    );

    forkJoin(remoteRequests).subscribe({
      next: (results) => {
        const remoteEntries: ProjectEntry[] = [];
        results.forEach((names, index) => {
          const backend = backends[index];
          names.forEach((name) => {
            remoteEntries.push({
              name,
              source: 'remote',
              backendUrl: backend.url,
            });
          });
        });
        this.projects.set([...localEntries, ...remoteEntries]);
        this.loading.set(false);
      },
      error: (err) => {
        this.projects.set(localEntries);
        this.error.set('Failed to load remote projects');
        this.loading.set(false);
        console.error('Failed to load remote projects', err);
      },
    });
  }

  selectProject(entry: ProjectEntry): void {
    const current = this.currentProject();
    const isSameProject =
      current?.name === entry.name &&
      current?.source === entry.source &&
      (current?.backendUrl ?? '') === (entry.backendUrl ?? '');

    if (isSameProject && (this.loading() || this.currentFlags() !== null)) {
      return;
    }

    this.currentProject.set(entry);
    this.loading.set(true);
    this.error.set(null);

    if (entry.source === 'local') {
      const content = this.localStore.getProject(entry.name);
      this.currentFlags.set(content?.flags ?? {});
      this.currentEvaluators.set(content?.$evaluators);
      this.currentMetadata.set(content?.metadata);
      this.loading.set(false);
    } else {
      this.remoteApi.getProject(entry.backendUrl!, entry.name).subscribe({
        next: (res) => {
          this.currentFlags.set(res.flags ?? {});
          this.currentEvaluators.set(res.$evaluators);
          this.currentMetadata.set(res.metadata);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(`Failed to load project "${entry.name}"`);
          this.currentFlags.set(null);
          this.currentEvaluators.set(undefined);
          this.currentMetadata.set(undefined);
          this.loading.set(false);
          console.error('Failed to load project', err);
        },
      });
    }
  }

  /** Find a ProjectEntry by source parameters and select it */
  selectProjectByRoute(source: string, name: string, backendId?: string): void {
    if (source === 'local') {
      this.selectProject({ name, source: 'local' });
    } else if (backendId) {
      const backend = this.backendRegistry.getBackendById(backendId);
      if (backend) {
        this.selectProject({ name, source: 'remote', backendUrl: backend.url });
      } else {
        this.error.set(`Backend "${backendId}" not found`);
      }
    }
  }

  createLocalProject(name: string): void {
    this.error.set(null);
    try {
      this.localStore.createProject(name);
      this.loadProjects();
      this.router.navigate(['/projects', 'local', name]);
    } catch (err: any) {
      this.error.set(err.message ?? 'Failed to create project');
    }
  }

  createRemoteProject(backendUrl: string, name: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.remoteApi.createProject(backendUrl, name, { flags: {} }).subscribe({
      next: () => {
        this.loadProjects();
        const backend = this.backendRegistry.getBackends().find((b) => b.url === backendUrl);
        if (backend) {
          this.router.navigate(['/projects', 'remote', backend.id, name]);
        }
      },
      error: (err) => {
        this.error.set(`Failed to create project "${name}"`);
        this.loading.set(false);
        console.error('Failed to create project', err);
      },
    });
  }

  deleteProject(entry: ProjectEntry): void {
    this.loading.set(true);
    this.error.set(null);

    const isCurrent =
      this.currentProject()?.name === entry.name && this.currentProject()?.source === entry.source;

    if (entry.source === 'local') {
      this.localStore.deleteProject(entry.name);
      if (isCurrent) {
        this.currentProject.set(null);
        this.currentFlags.set(null);
        this.currentMetadata.set(undefined);
        this.router.navigate(['/']);
      }
      this.loadProjects();
    } else {
      this.remoteApi.deleteProject(entry.backendUrl!, entry.name).subscribe({
        next: () => {
          if (isCurrent) {
            this.currentProject.set(null);
            this.currentFlags.set(null);
            this.currentMetadata.set(undefined);
            this.router.navigate(['/']);
          }
          this.loadProjects();
        },
        error: (err) => {
          this.error.set(`Failed to delete project "${entry.name}"`);
          this.loading.set(false);
          console.error('Failed to delete project', err);
        },
      });
    }
  }

  saveFlag(key: string, flag: FlagDefinition): void {
    const project = this.currentProject();
    if (!project) return;

    const current = this.currentFlags() ?? {};
    const updated = { ...current, [key]: flag };
    const metadata = this.currentMetadata();
    const content = this.buildProjectContent(updated, metadata);

    this.loading.set(true);
    this.error.set(null);

    if (project.source === 'local') {
      try {
        this.localStore.updateProjectContent(project.name, content);
        this.currentFlags.set(updated);
        this.currentMetadata.set(metadata);
      } catch (err: any) {
        this.error.set(`Failed to save flag "${key}"`);
      }
      this.loading.set(false);
    } else {
      this.remoteApi.updateProject(project.backendUrl!, project.name, content).subscribe({
        next: () => {
          this.currentFlags.set(updated);
          this.currentMetadata.set(metadata);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(`Failed to save flag "${key}"`);
          this.loading.set(false);
          console.error('Failed to save flag', err);
        },
      });
    }
  }

  deleteFlag(key: string): void {
    const project = this.currentProject();
    if (!project) return;

    const current = this.currentFlags();
    if (!current) return;

    const updated = { ...current };
    delete updated[key];
    const metadata = this.currentMetadata();
    const content = this.buildProjectContent(updated, metadata);

    this.loading.set(true);
    this.error.set(null);

    if (project.source === 'local') {
      try {
        this.localStore.updateProjectContent(project.name, content);
        this.currentFlags.set(updated);
        this.currentMetadata.set(metadata);
      } catch (err: any) {
        this.error.set(`Failed to delete flag "${key}"`);
      }
      this.loading.set(false);
    } else {
      this.remoteApi.updateProject(project.backendUrl!, project.name, content).subscribe({
        next: () => {
          this.currentFlags.set(updated);
          this.currentMetadata.set(metadata);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(`Failed to delete flag "${key}"`);
          this.loading.set(false);
          console.error('Failed to delete flag', err);
        },
      });
    }
  }

  renameFlag(oldKey: string, newKey: string, flag: FlagDefinition): void {
    const project = this.currentProject();
    if (!project) return;

    const current = this.currentFlags() ?? {};
    const updated = { ...current };
    delete updated[oldKey];
    updated[newKey] = flag;
    const metadata = this.currentMetadata();
    const content = this.buildProjectContent(updated, metadata);

    this.loading.set(true);
    this.error.set(null);

    if (project.source === 'local') {
      try {
        this.localStore.updateProjectContent(project.name, content);
        this.currentFlags.set(updated);
        this.currentMetadata.set(metadata);
      } catch (err: any) {
        this.error.set(`Failed to rename flag "${oldKey}"`);
      }
      this.loading.set(false);
    } else {
      this.remoteApi.updateProject(project.backendUrl!, project.name, content).subscribe({
        next: () => {
          this.currentFlags.set(updated);
          this.currentMetadata.set(metadata);
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

  importLocalProject(name: string, content: FlagFileContent): void {
    this.localStore.importFile(name, content);
    this.loadProjects();
    this.router.navigate(['/projects', 'local', name]);
  }

  saveProjectMetadata(metadata: MetadataMap | undefined): void {
    const project = this.currentProject();
    const flags = this.currentFlags();
    if (!project || !flags) return;

    const content = this.buildProjectContent(flags, metadata);

    this.loading.set(true);
    this.error.set(null);

    if (project.source === 'local') {
      try {
        this.localStore.updateProjectContent(project.name, content);
        this.currentMetadata.set(metadata);
      } catch {
        this.error.set('Failed to save project metadata');
      }
      this.loading.set(false);
      return;
    }

    this.remoteApi.updateProject(project.backendUrl!, project.name, content).subscribe({
      next: () => {
        this.currentMetadata.set(metadata);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to save project metadata');
        this.loading.set(false);
        console.error('Failed to save project metadata', err);
      },
    });
  }

  downloadCurrentProject(): void {
    const project = this.currentProject();
    const flags = this.currentFlags();
    if (!project || !flags) return;

    const content: FlagFileContent = {
      ...this.buildProjectContent(flags, this.currentMetadata()),
    };

    const blob = new Blob([JSON.stringify(content, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.flagd.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildProjectContent(
    flags: Record<string, FlagDefinition>,
    metadata: MetadataMap | undefined,
  ): FlagFileContent {
    const content: FlagFileContent = {
      $schema: 'https://flagd.dev/schema/v0/flags.json',
      flags,
    };

    // Preserve evaluators
    const evaluators = this.currentEvaluators();
    if (evaluators && Object.keys(evaluators).length > 0) {
      content.$evaluators = evaluators;
    }

    if (metadata && Object.keys(metadata).length > 0) {
      content.metadata = metadata;
    }

    return content;
  }

  /** Update evaluators for the current project */
  updateEvaluators(evaluators: Record<string, Evaluator> | undefined): void {
    const project = this.currentProject();
    if (!project) return;

    this.currentEvaluators.set(evaluators);
    
    // Save the updated content
    const flags = this.currentFlags() ?? {};
    const metadata = this.currentMetadata();
    const content = this.buildProjectContent(flags, metadata);

    this.loading.set(true);
    this.error.set(null);

    if (project.source === 'local') {
      try {
        this.localStore.updateProjectContent(project.name, content);
      } catch (err: any) {
        this.error.set('Failed to update environments');
      }
      this.loading.set(false);
    } else {
      this.remoteApi.updateProject(project.backendUrl!, project.name, content).subscribe({
        next: () => {
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('Failed to update environments');
          this.loading.set(false);
          console.error('Failed to update environments', err);
        },
      });
    }
  }
}
