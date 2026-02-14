import { inject, Injectable } from '@angular/core';
import { Store } from '@ngxs/store';
import { FlagDefinition, FlagFileContent } from '../models/flag.models';
import {
  CreateLocalProjectEntry,
  DeleteLocalProjectEntry,
  SaveLocalProjectContent,
} from '../state/flag-store.actions';
import { FlagStoreState } from '../state/flag-store.state';

@Injectable({ providedIn: 'root' })
export class LocalStore {
  private readonly store = inject(Store);

  private getAll(): Record<string, FlagFileContent> {
    return this.store.selectSnapshot(FlagStoreState.localProjects);
  }

  listProjects(): string[] {
    return Object.keys(this.getAll()).sort();
  }

  getProject(name: string): FlagFileContent | null {
    return this.getAll()[name] ?? null;
  }

  saveProject(name: string, content: FlagFileContent): void {
    this.store.dispatch(new SaveLocalProjectContent(name, content));
  }

  createProject(name: string): void {
    this.store.dispatch(new CreateLocalProjectEntry(name));
  }

  updateFlags(name: string, flags: Record<string, FlagDefinition>): void {
    const all = this.getAll();
    const existing = all[name];
    if (!existing) throw new Error(`Project "${name}" not found`);
    this.store.dispatch(new SaveLocalProjectContent(name, { ...existing, flags }));
  }

  updateProjectContent(name: string, content: FlagFileContent): void {
    const all = this.getAll();
    if (!all[name]) throw new Error(`Project "${name}" not found`);
    this.store.dispatch(new SaveLocalProjectContent(name, content));
  }

  deleteProject(name: string): void {
    this.store.dispatch(new DeleteLocalProjectEntry(name));
  }

  importFile(name: string, content: FlagFileContent): void {
    this.store.dispatch(new SaveLocalProjectContent(name, content));
  }
}
