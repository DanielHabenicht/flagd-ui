import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { FlagStore } from '../../services/flag-store';
import { FlagEditorComponent } from '../flag-editor/flag-editor';
import { FlagDefinition, FlagEntry, inferFlagType } from '../../models/flag.models';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [FlagEditorComponent, MatTableModule, MatButtonModule, MatIconModule, MatChipsModule],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css',
})
export class ProjectDetailComponent implements OnInit {
  readonly store = inject(FlagStore);
  private readonly route = inject(ActivatedRoute);

  showEditor = signal(false);
  editingFlag = signal<FlagEntry | null>(null);
  readonly existingFlagKeys = computed(() => this.store.flagEntries().map((f) => f.key));
  readonly displayedColumns = ['key', 'type', 'state', 'variants', 'default', 'targeting', 'actions'];

  getFlagType(flag: FlagEntry): string {
    return inferFlagType(flag.variants);
  }

  getVariantNames(flag: FlagEntry): string[] {
    return Object.keys(flag.variants);
  }

  hasTargeting(flag: FlagEntry): boolean {
    return !!flag.targeting && Object.keys(flag.targeting).length > 0;
  }

  confirmDelete(flag: FlagEntry): void {
    if (confirm(`Delete flag "${flag.key}"?`)) {
      this.onDeleteFlag(flag.key);
    }
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const name = params.get('name');
      const backendId = params.get('backendId');
      if (!name) return;

      const routePath = this.route.snapshot.routeConfig?.path ?? '';
      if (routePath.startsWith('projects/remote')) {
        this.store.selectProjectByRoute('remote', name, backendId ?? undefined);
      } else {
        this.store.selectProjectByRoute('local', name);
      }
    });
  }

  openNewFlagEditor(): void {
    this.editingFlag.set(null);
    this.showEditor.set(true);
  }

  openEditFlagEditor(flag: FlagEntry): void {
    this.editingFlag.set(flag);
    this.showEditor.set(true);
  }

  closeEditor(): void {
    this.showEditor.set(false);
    this.editingFlag.set(null);
  }

  onSaveFlag(event: { key: string; flag: FlagDefinition; originalKey?: string }): void {
    if (event.originalKey && event.originalKey !== event.key) {
      this.store.renameFlag(event.originalKey, event.key, event.flag);
    } else {
      this.store.saveFlag(event.key, event.flag);
    }
    this.closeEditor();
  }

  onDeleteFlag(key: string): void {
    this.store.deleteFlag(key);
  }

  downloadProject(): void {
    this.store.downloadCurrentProject();
  }
}
