import { inject, Injectable } from '@angular/core';
import { Store } from '@ngxs/store';
import { FlagDefinition, FlagFileContent } from '../models/flag.models';
import {
  CreateLocalFlagsFileEntry,
  DeleteLocalFlagsFileEntry,
  SaveLocalFlagsFileContent,
} from '../state/flag-store.actions';
import { FlagStoreState } from '../state/flag-store.state';

@Injectable({ providedIn: 'root' })
export class LocalStore {
  private readonly store = inject(Store);

  private getAll(): Record<string, FlagFileContent> {
    return this.store.selectSnapshot(FlagStoreState.localFlagsFiles);
  }

  listFlagsFiles(): string[] {
    return Object.keys(this.getAll()).sort();
  }

  getFlagsFile(name: string): FlagFileContent | null {
    return this.getAll()[name] ?? null;
  }

  saveFlagsFile(name: string, content: FlagFileContent): void {
    this.store.dispatch(new SaveLocalFlagsFileContent(name, content));
  }

  createFlagsFile(name: string): void {
    this.store.dispatch(new CreateLocalFlagsFileEntry(name));
  }

  updateFlags(name: string, flags: Record<string, FlagDefinition>): void {
    const all = this.getAll();
    const existing = all[name];
    if (!existing) throw new Error(`Flags-file "${name}" not found`);
    this.store.dispatch(new SaveLocalFlagsFileContent(name, { ...existing, flags }));
  }

  updateFlagsFileContent(name: string, content: FlagFileContent): void {
    const all = this.getAll();
    if (!all[name]) throw new Error(`Flags-file "${name}" not found`);
    this.store.dispatch(new SaveLocalFlagsFileContent(name, content));
  }

  deleteFlagsFile(name: string): void {
    this.store.dispatch(new DeleteLocalFlagsFileEntry(name));
  }

  importFile(name: string, content: FlagFileContent): void {
    this.store.dispatch(new SaveLocalFlagsFileContent(name, content));
  }
}
