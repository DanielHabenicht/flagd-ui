import { Injectable } from '@angular/core';
import { FlagDefinition, FlagFileContent } from '../models/flag.models';

const STORAGE_KEY = 'flagd-ui-local-projects';

@Injectable({ providedIn: 'root' })
export class LocalStore {
  private getAll(): Record<string, FlagFileContent> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private saveAll(data: Record<string, FlagFileContent>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  listProjects(): string[] {
    return Object.keys(this.getAll()).sort();
  }

  getProject(name: string): FlagFileContent | null {
    return this.getAll()[name] ?? null;
  }

  saveProject(name: string, content: FlagFileContent): void {
    const all = this.getAll();
    all[name] = content;
    this.saveAll(all);
  }

  createProject(name: string): void {
    const all = this.getAll();
    if (all[name]) throw new Error(`Project "${name}" already exists`);
    all[name] = { flags: {} };
    this.saveAll(all);
  }

  updateFlags(name: string, flags: Record<string, FlagDefinition>): void {
    const all = this.getAll();
    const existing = all[name];
    if (!existing) throw new Error(`Project "${name}" not found`);
    all[name] = { ...existing, flags };
    this.saveAll(all);
  }

  updateProjectContent(name: string, content: FlagFileContent): void {
    const all = this.getAll();
    if (!all[name]) throw new Error(`Project "${name}" not found`);
    all[name] = content;
    this.saveAll(all);
  }

  deleteProject(name: string): void {
    const all = this.getAll();
    delete all[name];
    this.saveAll(all);
  }

  importFile(name: string, content: FlagFileContent): void {
    const all = this.getAll();
    all[name] = content;
    this.saveAll(all);
  }
}
