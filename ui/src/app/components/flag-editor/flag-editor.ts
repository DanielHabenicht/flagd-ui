import { Component, input, output, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FlagDefinition, FlagEntry, FlagState, FlagType, inferFlagType, getDefaultVariants } from '../../models/flag.models';
import { VariantsEditorComponent, VariantRow } from '../variants-editor/variants-editor';
import { TargetingEditorComponent } from '../targeting-editor/targeting-editor';

export type EditorMode = 'easy' | 'advanced' | 'json';

@Component({
  selector: 'app-flag-editor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    VariantsEditorComponent,
    TargetingEditorComponent,
    MatButtonToggleModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
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
  metadata = signal<Record<string, string | number | boolean> | undefined>(undefined);
  editorMode = signal<EditorMode>('easy');

  // JSON editor state
  rawJson = '';
  jsonError: string | null = null;

  readonly isEditing = computed(() => this.flag() !== null);

  readonly variantNames = computed(() => this.variants().map((v) => v.name).filter(Boolean));

  readonly easyModeAvailable = computed(() => {
    const variants = this.variants();
    const targeting = this.targeting();
    const flagType = this.form?.get('flagType')?.value as FlagType | undefined;

    if (!flagType || (flagType !== 'boolean' && flagType !== 'string')) return false;
    if (targeting && Object.keys(targeting).length > 0) return false;
    return this.isSimpleFlagStructure(flagType, variants);
  });

  readonly keyAlreadyExists = computed(() => {
    if (!this.form) return false;
    const key = String(this.form.get('key')?.value ?? '').trim();
    if (!key) return false;
    if (this.flag()?.key === key) return false;
    return this.existingKeys().includes(key);
  });
  readonly canSave = computed(() => {
    if (!this.form) return false;
    if (this.form.invalid || this.keyAlreadyExists()) return false;
    if (this.editorMode() === 'json') {
      return !this.jsonError && this.rawJson.trim().length > 0;
    }
    return this.variantNames().length > 0;
  });

  ngOnInit(): void {
    const f = this.flag();

    const initialType: FlagType = f ? inferFlagType(f.variants) : 'boolean';
    const initialVariants: VariantRow[] = f
      ? Object.entries(f.variants).map(([name, value]) => ({ name, value }))
      : getDefaultVariants(initialType);

    this.variants.set(initialVariants);
    this.targeting.set(f?.targeting);
    this.metadata.set(f?.metadata);

    this.form = new FormGroup({
      key: new FormControl(f?.key ?? '', [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9._-]+$/),
      ]),
      state: new FormControl<FlagState>(f?.state ?? 'ENABLED', { nonNullable: true }),
      flagType: new FormControl<FlagType>(initialType, { nonNullable: true }),
      defaultVariant: new FormControl<string>(f?.defaultVariant ?? ''),
      // Easy mode fields
      easyType: new FormControl<'boolean' | 'string'>(
        initialType === 'boolean' || initialType === 'string' ? initialType : 'boolean',
        { nonNullable: true },
      ),
      easyStringValue: new FormControl<string>(
        initialType === 'string' && initialVariants.length > 0
          ? String(initialVariants[0]?.value ?? '')
          : '',
      ),
    });

    // Determine initial editor mode
    if (f) {
      const isSimpleType = initialType === 'boolean' || initialType === 'string';
      const hasTargeting = f.targeting && Object.keys(f.targeting).length > 0;
      const isSimpleVariants = this.isSimpleFlagStructure(initialType, initialVariants);

      if (isSimpleType && !hasTargeting && isSimpleVariants) {
        this.editorMode.set('easy');
      } else {
        this.editorMode.set('advanced');
      }
    }

    // Initialize JSON representation
    this.syncToJson();
  }

  setMode(mode: EditorMode): void {
    const previousMode = this.editorMode();
    if (mode === previousMode) return;

    if (previousMode === 'json' && mode !== 'json') {
      // Leaving JSON mode: try to parse and restore structured fields
      if (!this.applyJsonToForm()) {
        return; // Invalid JSON, don't switch
      }
    }

    if (mode === 'easy') {
      // After applying JSON (if coming from json), check compatibility
      if (!this.easyModeAvailable()) return;
      if (previousMode === 'advanced') {
        this.syncAdvancedToEasy();
      }
    }

    if (previousMode === 'easy' && mode === 'advanced') {
      this.syncEasyToAdvanced();
    }

    if (mode === 'json') {
      if (previousMode === 'easy') {
        this.syncEasyToAdvanced();
      }
      this.syncToJson();
    }

    this.editorMode.set(mode);
  }

  // --- Easy mode ---

  onEasyTypeChange(): void {
    const easyType = this.form.get('easyType')!.value as 'boolean' | 'string';
    this.form.get('flagType')!.setValue(easyType);
    if (easyType === 'boolean') {
      this.variants.set(getDefaultVariants('boolean'));
      this.form.get('defaultVariant')!.setValue('on');
    } else {
      this.variants.set([
        { name: 'on', value: '' },
        { name: 'off', value: '' },
      ]);
      this.form.get('defaultVariant')!.setValue('on');
      this.form.get('easyStringValue')!.setValue('');
    }
  }

  onEasyStateToggle(): void {
    const current = this.form.get('state')!.value as FlagState;
    this.form.get('state')!.setValue(current === 'ENABLED' ? 'DISABLED' : 'ENABLED');
  }

  onEasyStringValueChange(): void {
    const value = this.form.get('easyStringValue')!.value;
    const currentVariants = this.variants();
    if (currentVariants.length >= 1) {
      const updated = [...currentVariants];
      updated[0] = { ...updated[0], value };
      this.variants.set(updated);
    }
  }

  onEasyDefaultChange(value: string): void {
    this.form.get('defaultVariant')!.setValue(value);
  }

  // --- Advanced mode ---

  onTypeChange(): void {
    const newType = this.form.get('flagType')!.value as FlagType;
    this.variants.set(getDefaultVariants(newType));
    this.form.get('defaultVariant')!.setValue('');
  }

  onVariantsChange(rows: VariantRow[]): void {
    this.variants.set(rows);
    const currentDefault = this.form.get('defaultVariant')!.value;
    const names = rows.map((r) => r.name).filter(Boolean);
    if (currentDefault && !names.includes(currentDefault)) {
      this.form.get('defaultVariant')!.setValue(names[0] ?? '');
    }
  }

  onTargetingChange(t: Record<string, unknown> | undefined): void {
    this.targeting.set(t);
  }

  // --- JSON mode ---

  onJsonInput(value: string): void {
    this.rawJson = value;
    try {
      JSON.parse(value);
      this.jsonError = null;
    } catch {
      this.jsonError = 'Invalid JSON';
    }
  }

  formatJson(): void {
    try {
      const parsed = JSON.parse(this.rawJson);
      this.rawJson = JSON.stringify(parsed, null, 2);
      this.jsonError = null;
    } catch {
      this.jsonError = 'Cannot format: invalid JSON';
    }
  }

  // --- Save ---

  onSave(): void {
    const mode = this.editorMode();
    const key = String(this.form.get('key')!.value ?? '').trim();

    if (mode === 'json') {
      this.saveFromJson();
      return;
    }

    if (mode === 'easy') {
      this.syncEasyToAdvanced();
    }

    if (!this.form.valid || this.keyAlreadyExists() || !key) return;

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

    if (mode === 'advanced') {
      const t = this.targeting();
      if (t && Object.keys(t).length > 0) {
        flag.targeting = t;
      }
    } else {
      flag.targeting = undefined;
    }

    const metadata = this.metadata();
    if (metadata && Object.keys(metadata).length > 0) {
      flag.metadata = metadata;
    }

    this.save.emit({
      key,
      flag,
      originalKey: this.flag()?.key,
    });
  }

  onCancel(): void {
    this.cancel.emit();
  }

  // --- Private helpers ---

  private isSimpleFlagStructure(type: FlagType, variants: VariantRow[]): boolean {
    if (variants.length !== 2) return false;
    const names = variants.map((v) => v.name).sort();
    if (names[0] !== 'off' || names[1] !== 'on') return false;

    if (type === 'boolean') {
      const values = new Map(variants.map((v) => [v.name, v.value]));
      return values.get('on') === true && values.get('off') === false;
    }
    if (type === 'string') {
      return variants.every((v) => typeof v.value === 'string');
    }
    return false;
  }

  private syncEasyToAdvanced(): void {
    const easyType = this.form.get('easyType')!.value as 'boolean' | 'string';
    this.form.get('flagType')!.setValue(easyType);

    if (easyType === 'boolean') {
      this.variants.set(getDefaultVariants('boolean'));
      const currentDefault = this.form.get('defaultVariant')!.value;
      if (currentDefault !== 'on' && currentDefault !== 'off') {
        this.form.get('defaultVariant')!.setValue('on');
      }
    } else {
      const value = this.form.get('easyStringValue')!.value ?? '';
      this.variants.set([
        { name: 'on', value },
        { name: 'off', value: '' },
      ]);
      const currentDefault = this.form.get('defaultVariant')!.value;
      if (currentDefault !== 'on' && currentDefault !== 'off') {
        this.form.get('defaultVariant')!.setValue('on');
      }
    }
  }

  private syncAdvancedToEasy(): void {
    const flagType = this.form.get('flagType')!.value as FlagType;
    const easyType = flagType === 'string' ? 'string' : 'boolean';
    this.form.get('easyType')!.setValue(easyType);

    if (easyType === 'string') {
      const currentVariants = this.variants();
      const onVariant = currentVariants.find((variant) => variant.name === 'on');
      const fallback = currentVariants[0];
      const source = onVariant ?? fallback;
      if (source) {
        this.form.get('easyStringValue')!.setValue(String(source.value ?? ''));
      }
      const currentDefault = this.form.get('defaultVariant')!.value;
      if (currentDefault !== 'on' && currentDefault !== 'off') {
        this.form.get('defaultVariant')!.setValue('on');
      }
    } else {
      this.form.get('defaultVariant')!.setValue('on');
    }
  }

  private syncToJson(): void {
    const variantsObj: Record<string, unknown> = {};
    for (const v of this.variants()) {
      if (v.name) {
        variantsObj[v.name] = v.value;
      }
    }

    const flag: Record<string, unknown> = {
      state: this.form.get('state')!.value,
      variants: variantsObj,
    };

    const defaultVariant = this.form.get('defaultVariant')!.value;
    if (defaultVariant) {
      flag['defaultVariant'] = defaultVariant;
    }

    const t = this.targeting();
    if (t && Object.keys(t).length > 0) {
      flag['targeting'] = t;
    }

    const metadata = this.metadata();
    if (metadata && Object.keys(metadata).length > 0) {
      flag['metadata'] = metadata;
    }

    this.rawJson = JSON.stringify(flag, null, 2);
    this.jsonError = null;
  }

  private applyJsonToForm(): boolean {
    try {
      const parsed = JSON.parse(this.rawJson);
      if (typeof parsed !== 'object' || parsed === null) {
        this.jsonError = 'JSON must be an object';
        return false;
      }

      const state: FlagState = parsed.state === 'DISABLED' ? 'DISABLED' : 'ENABLED';
      this.form.get('state')!.setValue(state);

      if (parsed.variants && typeof parsed.variants === 'object') {
        const variantRows: VariantRow[] = Object.entries(parsed.variants).map(([name, value]) => ({
          name,
          value,
        }));
        this.variants.set(variantRows);

        const flagType = inferFlagType(parsed.variants);
        this.form.get('flagType')!.setValue(flagType);
        this.form.get('easyType')!.setValue(
          flagType === 'boolean' || flagType === 'string' ? flagType : 'boolean',
        );
      }

      if (parsed.defaultVariant !== undefined) {
        this.form.get('defaultVariant')!.setValue(parsed.defaultVariant ?? '');
      }

      if (parsed.targeting && typeof parsed.targeting === 'object') {
        this.targeting.set(parsed.targeting);
      } else {
        this.targeting.set(undefined);
      }

      if (parsed.metadata && typeof parsed.metadata === 'object') {
        this.metadata.set(parsed.metadata as Record<string, string | number | boolean>);
      } else {
        this.metadata.set(undefined);
      }

      this.jsonError = null;
      return true;
    } catch {
      this.jsonError = 'Invalid JSON - fix before switching modes';
      return false;
    }
  }

  private saveFromJson(): void {
    const key = String(this.form.get('key')!.value ?? '').trim();
    if (!key || this.form.get('key')!.invalid || this.keyAlreadyExists()) return;

    try {
      const parsed = JSON.parse(this.rawJson);
      if (typeof parsed !== 'object' || parsed === null) {
        this.jsonError = 'JSON must be an object';
        return;
      }

      if (!parsed.state) {
        this.jsonError = 'Missing required field: "state"';
        return;
      }

      if (!parsed.variants || typeof parsed.variants !== 'object' || Object.keys(parsed.variants).length === 0) {
        this.jsonError = 'Must have at least one variant';
        return;
      }

      const flag: FlagDefinition = {
        state: parsed.state,
        variants: parsed.variants,
      };

      if (parsed.defaultVariant) {
        flag.defaultVariant = parsed.defaultVariant;
      }

      if (parsed.targeting && Object.keys(parsed.targeting).length > 0) {
        flag.targeting = parsed.targeting;
      }

      if (parsed.metadata) {
        flag.metadata = parsed.metadata;
      }

      this.save.emit({
        key,
        flag,
        originalKey: this.flag()?.key,
      });
    } catch {
      this.jsonError = 'Invalid JSON';
    }
  }
}
