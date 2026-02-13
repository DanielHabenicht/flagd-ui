import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FlagStore } from '../../services/flag-store';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, FormsModule],
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
