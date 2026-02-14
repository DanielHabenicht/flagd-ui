import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FlagStore } from '../../services/flag-store';
import {
  Environment,
  Evaluator,
  createEnvironmentEvaluator,
} from '../../models/flag.models';

interface EnvironmentForm {
  name: string;
  aliases: string;
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
    MatDialogModule,
  ],
  templateUrl: './environment-manager.html',
  styleUrl: './environment-manager.scss',
})
export class EnvironmentManagerComponent {
  private readonly store = inject(FlagStore);
  private readonly dialogRef = inject(MatDialogRef<EnvironmentManagerComponent>);

  readonly environments = signal<Environment[]>([]);
  readonly editingIndex = signal<number | null>(null);
  readonly form = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.pattern(/^[a-zA-Z][a-zA-Z0-9]*$/)]),
    aliases: new FormControl('', [Validators.required]),
  });

  readonly isEditing = computed(() => this.editingIndex() !== null);

  ngOnInit(): void {
    // Load current environments
    const currentEnvs = this.store.currentEnvironments();
    this.environments.set([...currentEnvs]);
  }

  addEnvironment(): void {
    if (!this.form.valid) return;

    const formValue = this.form.value as EnvironmentForm;
    const name = formValue.name.trim();
    const aliasesStr = formValue.aliases.trim();
    const aliases = aliasesStr.split(',').map((a) => a.trim()).filter((a) => a.length > 0);

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

    this.form.reset();
  }

  editEnvironment(index: number): void {
    const env = this.environments()[index];
    if (!env) return;

    this.form.patchValue({
      name: env.name,
      aliases: env.aliases.join(', '),
    });
    this.editingIndex.set(index);
  }

  deleteEnvironment(index: number): void {
    const updated = this.environments().filter((_, i) => i !== index);
    this.environments.set(updated);
  }

  cancelEdit(): void {
    this.editingIndex.set(null);
    this.form.reset();
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
    this.dialogRef.close(true);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
