import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { FlagStore } from '../../services/flag-store';
import { BackendRegistry } from '../../services/backend-registry';
import { ProjectEntry } from '../../models/flag.models';
import { NewProjectDialogComponent } from '../new-project-dialog/new-project-dialog';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
  ],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
})
export class ProjectListComponent implements OnInit {
  readonly store = inject(FlagStore);
  private readonly dialog = inject(MatDialog);
  private readonly backendRegistry = inject(BackendRegistry);

  ngOnInit(): void {
    // Auto-detect same-origin backend and register it
    this.backendRegistry.probeDefaultBackend().subscribe((available) => {
      this.store.hasDefaultBackend.set(available);
      if (available) {
        this.backendRegistry.addBackend('', 'This Server');
      }
      this.store.loadProjects();
    });
  }

  openNewProjectDialog(): void {
    this.dialog.open(NewProjectDialogComponent, {
      width: '520px',
    });
  }

  getProjectRoute(project: ProjectEntry): string[] {
    if (project.source === 'local') {
      return ['/projects', 'local', project.name];
    }
    const backend = this.backendRegistry
      .getBackends()
      .find((b) => b.url === project.backendUrl);
    return ['/projects', 'remote', backend?.id ?? '', project.name];
  }

  deleteProject(event: Event, project: ProjectEntry): void {
    event.preventDefault();
    event.stopPropagation();
    if (confirm(`Delete "${project.name}"? This will remove all flags in this file.`)) {
      this.store.deleteProject(project);
    }
  }
}
