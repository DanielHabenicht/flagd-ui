import { Component, input, output, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FlagDefinition, FlagEntry, FlagState, FlagType, inferFlagType, getDefaultVariants } from '../../models/flag.models';
import { VariantsEditorComponent, VariantRow } from '../variants-editor/variants-editor';
import { TargetingEditorComponent } from '../targeting-editor/targeting-editor';

@Component({
  selector: 'app-flag-editor',
  standalone: true,
  imports: [ReactiveFormsModule, VariantsEditorComponent, TargetingEditorComponent],
  templateUrl: './flag-editor.html',
  styleUrl: './flag-editor.css',
})
export class FlagEditorComponent implements OnInit {
  readonly flag = input<FlagEntry | null>(null);
  readonly existingKeys = input<string[]>([]);
  readonly save = output<{ key: string; flag: FlagDefinition; originalKey?: string }>();
  readonly cancel = output<void>();

  form!: FormGroup;
  variants = signal<VariantRow[]>([]);
  targeting = signal<Record<string, unknown> | undefined>(undefined);

  readonly isEditing = computed(() => this.flag() !== null);

  readonly variantNames = computed(() => this.variants().map((v) => v.name).filter(Boolean));

  ngOnInit(): void {
    const f = this.flag();

    const initialType: FlagType = f ? inferFlagType(f.variants) : 'boolean';
    const initialVariants: VariantRow[] = f
      ? Object.entries(f.variants).map(([name, value]) => ({ name, value }))
      : getDefaultVariants(initialType);

    this.variants.set(initialVariants);
    this.targeting.set(f?.targeting);

    this.form = new FormGroup({
      key: new FormControl(f?.key ?? '', [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9._-]+$/),
      ]),
      state: new FormControl<FlagState>(f?.state ?? 'ENABLED', { nonNullable: true }),
      flagType: new FormControl<FlagType>(initialType, { nonNullable: true }),
      defaultVariant: new FormControl<string>(f?.defaultVariant ?? ''),
    });
  }

  onTypeChange(): void {
    const newType = this.form.get('flagType')!.value as FlagType;
    this.variants.set(getDefaultVariants(newType));
    this.form.get('defaultVariant')!.setValue('');
  }

  onVariantsChange(rows: VariantRow[]): void {
    this.variants.set(rows);
    // Update default variant if current selection is no longer valid
    const currentDefault = this.form.get('defaultVariant')!.value;
    const names = rows.map((r) => r.name).filter(Boolean);
    if (currentDefault && !names.includes(currentDefault)) {
      this.form.get('defaultVariant')!.setValue(names[0] ?? '');
    }
  }

  onTargetingChange(t: Record<string, unknown> | undefined): void {
    this.targeting.set(t);
  }

  onSave(): void {
    if (!this.form.valid) return;

    const variantsObj: Record<string, unknown> = {};
    for (const v of this.variants()) {
      if (v.name) {
        variantsObj[v.name] = v.value;
      }
    }

    if (Object.keys(variantsObj).length === 0) return;

    const flag: FlagDefinition = {
      state: this.form.get('state')!.value,
      variants: variantsObj,
    };

    const defaultVariant = this.form.get('defaultVariant')!.value;
    if (defaultVariant) {
      flag.defaultVariant = defaultVariant;
    }

    const t = this.targeting();
    if (t && Object.keys(t).length > 0) {
      flag.targeting = t;
    }

    this.save.emit({
      key: this.form.get('key')!.value,
      flag,
      originalKey: this.flag()?.key,
    });
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.onCancel();
    }
  }
}
