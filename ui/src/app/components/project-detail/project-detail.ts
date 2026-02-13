import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FlagStore } from '../../services/flag-store';
import { FlagCardComponent } from '../flag-card/flag-card';
import { FlagEditorComponent } from '../flag-editor/flag-editor';
import { FlagDefinition, FlagEntry } from '../../models/flag.models';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [FlagCardComponent, FlagEditorComponent],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css',
})
export class ProjectDetailComponent implements OnInit {
  readonly store = inject(FlagStore);
  private readonly route = inject(ActivatedRoute);

  showEditor = signal(false);
  editingFlag = signal<FlagEntry | null>(null);
  readonly existingFlagKeys = computed(() => this.store.flagEntries().map((f) => f.key));

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const name = params.get('name');
      if (name) {
        this.store.selectProject(name);
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
}
