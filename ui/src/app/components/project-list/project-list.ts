import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { FlagStore } from '../../services/flag-store';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    FormsModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
  ],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
})
export class ProjectListComponent implements OnInit {
  readonly store = inject(FlagStore);
  showCreateForm = false;
  newProjectName = '';

  ngOnInit(): void {
    this.store.loadProjects();
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    this.newProjectName = '';
  }

  createProject(): void {
    const name = this.newProjectName.trim();
    if (!name) return;
    this.store.createProject(name);
    this.showCreateForm = false;
    this.newProjectName = '';
  }

  deleteProject(event: Event, name: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (confirm(`Delete project "${name}"? This will remove all flags in this file.`)) {
      this.store.deleteProject(name);
    }
  }
}
