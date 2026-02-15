import { Component, inject, signal, computed, input, effect } from '@angular/core';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatDialogRef } from '@angular/material/dialog';
import { FlagStore } from '../../services/flag-store';
import { Environment, Evaluator, createEnvironmentEvaluator } from '../../models/flag.models';

interface EnvironmentForm {
  name: string;
  aliases: string[];
}

@Component({
  selector: 'app-environment-manager',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
  ],
  templateUrl: './environment-manager.html',
  styleUrl: './environment-manager.scss',
})
export class EnvironmentManagerComponent {
  readonly embedded = input(false);

  private readonly store = inject(FlagStore);
  private readonly dialogRef = inject(MatDialogRef<EnvironmentManagerComponent>, {
    optional: true,
  });

  readonly environments = signal<Environment[]>([]);
  readonly environmentFilter = signal('');
  readonly editingIndex = signal<number | null>(null);
  readonly aliasesInputValue = signal('');
  readonly separatorKeysCodes: readonly number[] = [ENTER, COMMA];
  readonly form = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.pattern(/^[a-zA-Z][a-zA-Z0-9]*$/)]),
    aliases: new FormControl<string[]>([], [Validators.required]),
  });

  readonly isEditing = computed(() => this.editingIndex() !== null);
  readonly isDialogMode = computed(() => !!this.dialogRef && !this.embedded());
  readonly hasLocalChanges = signal(false);
  readonly saveDisabled = computed(() => !this.hasLocalChanges() || this.store.loading());
  readonly filteredEnvironments = computed(() => {
    const query = this.environmentFilter().trim().toLowerCase();
    const entries = this.environments().map((env, index) => ({ env, index }));

    if (!query) {
      return entries;
    }

    return entries.filter(({ env }) => {
      if (env.name.toLowerCase().includes(query)) return true;
      if (env.displayName.toLowerCase().includes(query)) return true;
      return env.aliases.some((alias) => alias.toLowerCase().includes(query));
    });
  });

  private readonly syncEnvironmentsFromStore = effect(() => {
    const currentEnvs = this.store.currentEnvironments();
    if (this.hasLocalChanges()) {
      return;
    }

    this.environments.set([...currentEnvs]);
  });

  addEnvironment(): void {
    if (!this.form.valid) return;

    const formValue = this.form.getRawValue() as EnvironmentForm;
    const name = formValue.name.trim();
    const aliases = formValue.aliases.map((a) => a.trim()).filter((a) => a.length > 0);

    const newEnv: Environment = {
      name: name.toLowerCase(),
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      aliases,
    };

    const editIndex = this.editingIndex();
    if (editIndex !== null) {
      // Update existing
      const updated = [...this.environments()];
      updated[editIndex] = newEnv;
      this.environments.set(updated);
      this.editingIndex.set(null);
    } else {
      // Add new
      this.environments.set([...this.environments(), newEnv]);
    }

    this.hasLocalChanges.set(true);

    this.form.reset({ name: '', aliases: [] });
    this.aliasesInputValue.set('');
  }

  editEnvironment(index: number): void {
    const env = this.environments()[index];
    if (!env) return;

    this.form.patchValue({
      name: env.name,
      aliases: [...env.aliases],
    });
    this.aliasesInputValue.set('');
    this.editingIndex.set(index);
  }

  deleteEnvironment(index: number): void {
    const updated = this.environments().filter((_, i) => i !== index);
    this.environments.set(updated);
    this.hasLocalChanges.set(true);
  }

  cancelEdit(): void {
    this.editingIndex.set(null);
    this.form.reset({ name: '', aliases: [] });
    this.aliasesInputValue.set('');
  }

  addAliasFromInput(event: MatChipInputEvent): void {
    const rawValue = event.value ?? '';
    const alias = rawValue.trim();

    if (alias.length > 0) {
      const currentAliases = this.form.controls.aliases.value ?? [];
      if (!currentAliases.includes(alias)) {
        this.form.controls.aliases.setValue([...currentAliases, alias]);
      }
    }

    event.chipInput?.clear();
    this.aliasesInputValue.set('');
    this.form.controls.aliases.markAsTouched();
    this.form.controls.aliases.updateValueAndValidity();
  }

  removeAlias(alias: string): void {
    const currentAliases = this.form.controls.aliases.value ?? [];
    this.form.controls.aliases.setValue(currentAliases.filter((entry) => entry !== alias));
    this.form.controls.aliases.markAsTouched();
    this.form.controls.aliases.updateValueAndValidity();
  }

  editAlias(originalAlias: string, editedValue: string): void {
    const nextAlias = editedValue.trim();
    const currentAliases = this.form.controls.aliases.value ?? [];

    if (!currentAliases.includes(originalAlias)) {
      return;
    }

    if (nextAlias.length === 0) {
      this.removeAlias(originalAlias);
      return;
    }

    if (nextAlias !== originalAlias && currentAliases.includes(nextAlias)) {
      return;
    }

    const updatedAliases = currentAliases.map((entry) =>
      entry === originalAlias ? nextAlias : entry,
    );
    this.form.controls.aliases.setValue(updatedAliases);
    this.form.controls.aliases.markAsTouched();
    this.form.controls.aliases.updateValueAndValidity();
  }

  onAliasesInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.aliasesInputValue.set(target.value);
  }

  onEnvironmentFilterInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.environmentFilter.set(target.value);
  }

  save(): void {
    // Convert environments to evaluators
    const evaluators: Record<string, Evaluator> = {};

    for (const env of this.environments()) {
      const evaluatorName = `is${env.displayName}`;
      evaluators[evaluatorName] = createEnvironmentEvaluator(env.aliases);
    }

    // Update the store
    this.store.updateEvaluators(Object.keys(evaluators).length > 0 ? evaluators : undefined);
    this.hasLocalChanges.set(false);
    this.dialogRef?.close(true);
  }

  cancel(): void {
    this.dialogRef?.close(false);
  }
}
