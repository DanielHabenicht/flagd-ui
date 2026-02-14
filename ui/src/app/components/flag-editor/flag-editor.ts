import { Component, input, output, OnChanges, OnInit, computed, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTimepickerModule } from '@angular/material/timepicker';
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
    MatDatepickerModule,
    MatNativeDateModule,
    MatTimepickerModule,
  ],
  templateUrl: './flag-editor.html',
  styleUrl: './flag-editor.scss',
})
export class FlagEditorComponent implements OnInit, OnChanges {
  private static readonly TIMESTAMP_CONTEXT_VAR = '$flagd.timestamp';

  readonly inline = input(false);
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
  private initialEditorSnapshot = '';

  readonly isEditing = computed(() => this.flag() !== null);

  readonly variantNames = computed(() => this.variants().map((v) => v.name).filter(Boolean));

  readonly easyModeAvailable = computed(() => {
    const variants = this.variants();
    const targeting = this.targeting();
    const flagType = this.form?.get('flagType')?.value as FlagType | undefined;

    if (!flagType || (flagType !== 'boolean' && flagType !== 'string')) return false;
    if (targeting && Object.keys(targeting).length > 0 && !this.isEasyTimeTargeting(targeting)) return false;
    return this.isSimpleFlagStructure(flagType, variants);
  });

  keyAlreadyExists(): boolean {
    const keyControl = this.form?.get('key');
    return !!keyControl?.hasError('duplicateKey');
  }

  canSave(): boolean {
    if (!this.form) return false;
    if (!this.isCurrentModeFormValid() || this.keyAlreadyExists()) return false;
    if (!this.hasChanges()) return false;

    if (this.editorMode() === 'json') {
      return this.isJsonSaveValid();
    }

    return this.variantNames().length > 0;
  }

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
        this.duplicateKeyValidator(),
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
      easyStringOnValue: new FormControl<string>(
        initialType === 'string'
          ? String(initialVariants.find((variant) => variant.name === 'on')?.value ?? '')
          : '',
      ),
      easyStringOffValue: new FormControl<string>(
        initialType === 'string'
          ? String(initialVariants.find((variant) => variant.name === 'off')?.value ?? '')
          : '',
      ),
      easyStartDate: new FormControl<Date | null>(null),
      easyStartTime: new FormControl<Date | null>(null),
      easyEndDate: new FormControl<Date | null>(null),
      easyEndTime: new FormControl<Date | null>(null),
    });

    this.applyFlagToForm(f);
  }

  ngOnChanges(): void {
    if (!this.form) return;
    this.applyFlagToForm(this.flag());
  }

  private applyFlagToForm(f: FlagEntry | null): void {
    const nextType: FlagType = f ? inferFlagType(f.variants) : 'boolean';
    const nextVariants: VariantRow[] = f
      ? Object.entries(f.variants).map(([name, value]) => ({ name, value }))
      : getDefaultVariants(nextType);

    this.variants.set(nextVariants);
    this.targeting.set(f?.targeting);
    this.metadata.set(f?.metadata);

    const parsedEasyTimeTargeting = this.parseEasyTimeTargeting(f?.targeting);

    this.form.patchValue(
      {
        key: f?.key ?? '',
        state: f?.state ?? 'ENABLED',
        flagType: nextType,
        defaultVariant: f?.defaultVariant ?? '',
        easyType: nextType === 'boolean' || nextType === 'string' ? nextType : 'boolean',
        easyStringValue:
          nextType === 'string' && nextVariants.length > 0
            ? String(nextVariants[0]?.value ?? '')
            : '',
        easyStringOnValue:
          nextType === 'string'
            ? String(nextVariants.find((variant) => variant.name === 'on')?.value ?? '')
            : '',
        easyStringOffValue:
          nextType === 'string'
            ? String(nextVariants.find((variant) => variant.name === 'off')?.value ?? '')
            : '',
        easyStartDate: this.parseTimestampDate(parsedEasyTimeTargeting?.start),
        easyStartTime: this.parseTimestampDate(parsedEasyTimeTargeting?.start),
        easyEndDate: this.parseTimestampDate(parsedEasyTimeTargeting?.end),
        easyEndTime: this.parseTimestampDate(parsedEasyTimeTargeting?.end),
      },
      { emitEvent: false },
    );

    this.form.get('key')?.updateValueAndValidity({ emitEvent: false });

    this.updateEasyStringValidators();

    // Determine editor mode
    if (f) {
      const isSimpleType = nextType === 'boolean' || nextType === 'string';
      const hasUnsupportedTargeting =
        !!f.targeting &&
        Object.keys(f.targeting).length > 0 &&
        !this.isEasyTimeTargeting(f.targeting);
      const isSimpleVariants = this.isSimpleFlagStructure(nextType, nextVariants);

      if (isSimpleType && !hasUnsupportedTargeting && isSimpleVariants) {
        this.editorMode.set('easy');
      } else {
        this.editorMode.set('advanced');
      }
    } else {
      this.editorMode.set('easy');
    }

    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.jsonError = null;
    this.syncToJson();
    this.initialEditorSnapshot = this.buildEditorSnapshot();
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
    this.updateEasyStringValidators();
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
      this.form.get('easyStringOnValue')!.setValue('');
      this.form.get('easyStringOffValue')!.setValue('');
    }
  }

  onStateToggle(): void {
    const current = this.form.get('state')!.value as FlagState;
    const nextState: FlagState = current === 'ENABLED' ? 'DISABLED' : 'ENABLED';
    this.form.get('state')!.setValue(nextState);

    if (this.editorMode() === 'json') {
      this.syncJsonState(nextState);
    }
  }

  onEasyStringValueChange(): void {
    const onValue = this.form.get('easyStringOnValue')!.value ?? '';
    const offValue = this.form.get('easyStringOffValue')!.value ?? '';
    this.variants.set([
      { name: 'on', value: onValue },
      { name: 'off', value: offValue },
    ]);
  }

  onEasyDefaultChange(value: string): void {
    this.form.get('defaultVariant')!.setValue(value);
  }

  resetEasyTimeWindow(): void {
    this.form.get('easyStartDate')!.setValue(null);
    this.form.get('easyStartTime')!.setValue(null);
    this.form.get('easyEndDate')!.setValue(null);
    this.form.get('easyEndTime')!.setValue(null);
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

    if (!this.isCurrentModeFormValid() || this.keyAlreadyExists() || !key) return;

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

    if (mode === 'advanced' || mode === 'easy') {
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
      const onValue = this.form.get('easyStringOnValue')!.value ?? '';
      const offValue = this.form.get('easyStringOffValue')!.value ?? '';
      this.variants.set([
        { name: 'on', value: onValue },
        { name: 'off', value: offValue },
      ]);
      const currentDefault = this.form.get('defaultVariant')!.value;
      if (currentDefault !== 'on' && currentDefault !== 'off') {
        this.form.get('defaultVariant')!.setValue('on');
      }
    }

    this.targeting.set(this.buildEasyTimeTargeting());
  }

  private syncAdvancedToEasy(): void {
    const flagType = this.form.get('flagType')!.value as FlagType;
    const easyType = flagType === 'string' ? 'string' : 'boolean';
    this.form.get('easyType')!.setValue(easyType);

    if (easyType === 'string') {
      const currentVariants = this.variants();
      const onVariant = currentVariants.find((variant) => variant.name === 'on');
      const offVariant = currentVariants.find((variant) => variant.name === 'off');
      const fallback = currentVariants[0];
      const source = onVariant ?? fallback;
      if (source) {
        this.form.get('easyStringValue')!.setValue(String(source.value ?? ''));
        this.form.get('easyStringOnValue')!.setValue(String(source.value ?? ''));
      }
      this.form.get('easyStringOffValue')!.setValue(String(offVariant?.value ?? ''));
      const currentDefault = this.form.get('defaultVariant')!.value;
      if (currentDefault !== 'on' && currentDefault !== 'off') {
        this.form.get('defaultVariant')!.setValue('on');
      }
    } else {
      this.form.get('defaultVariant')!.setValue('on');
    }

    const parsedTimeTargeting = this.parseEasyTimeTargeting(this.targeting());
    this.form.get('easyStartTime')!.setValue(this.parseTimestampDate(parsedTimeTargeting?.start));
    this.form.get('easyStartDate')!.setValue(this.parseTimestampDate(parsedTimeTargeting?.start));
    this.form.get('easyEndTime')!.setValue(this.parseTimestampDate(parsedTimeTargeting?.end));
    this.form.get('easyEndDate')!.setValue(this.parseTimestampDate(parsedTimeTargeting?.end));
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

  private hasChanges(): boolean {
    if (!this.form) return false;
    return this.buildEditorSnapshot() !== this.initialEditorSnapshot;
  }

  private buildEditorSnapshot(): string {
    const key = String(this.form?.get('key')?.value ?? '').trim();
    const state = this.form?.get('state')?.value ?? 'ENABLED';
    const flagType = this.form?.get('flagType')?.value ?? 'boolean';
    const defaultVariant = this.form?.get('defaultVariant')?.value ?? '';
    const easyType = this.form?.get('easyType')?.value ?? 'boolean';
    const easyStringValue = this.form?.get('easyStringValue')?.value ?? '';
    const easyStringOnValue = this.form?.get('easyStringOnValue')?.value ?? '';
    const easyStringOffValue = this.form?.get('easyStringOffValue')?.value ?? '';
    const easyStartTime =
      this.toTimestampString(
        this.combineDateAndTime(
          this.form?.get('easyStartDate')?.value ?? null,
          this.form?.get('easyStartTime')?.value ?? null,
        ),
      ) ?? '';
    const easyEndTime =
      this.toTimestampString(
        this.combineDateAndTime(
          this.form?.get('easyEndDate')?.value ?? null,
          this.form?.get('easyEndTime')?.value ?? null,
        ),
      ) ?? '';

    return JSON.stringify({
      key,
      state,
      flagType,
      defaultVariant,
      easyType,
      easyStringValue,
      easyStringOnValue,
      easyStringOffValue,
      easyStartTime,
      easyEndTime,
      editorMode: this.editorMode(),
      variants: this.variants(),
      targeting: this.targeting() ?? null,
      metadata: this.metadata() ?? null,
      rawJson: this.rawJson.trim(),
    });
  }

  private updateEasyStringValidators(): void {
    const easyType = this.form.get('easyType')!.value as 'boolean' | 'string';
    const onControl = this.form.get('easyStringOnValue');
    const offControl = this.form.get('easyStringOffValue');

    if (!onControl || !offControl) return;

    if (easyType === 'string') {
      onControl.setValidators([this.nonWhitespaceRequiredValidator()]);
    } else {
      onControl.clearValidators();
      offControl.clearValidators();
    }

    onControl.updateValueAndValidity({ emitEvent: false });
    offControl.updateValueAndValidity({ emitEvent: false });
  }

  private nonWhitespaceRequiredValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = String(control.value ?? '');
      return value.trim().length > 0 ? null : { required: true };
    };
  }

  private duplicateKeyValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const key = String(control.value ?? '').trim();
      if (!key) return null;

      const originalKey = this.flag()?.key;
      if (originalKey && originalKey === key) return null;

      return this.existingKeys().includes(key) ? { duplicateKey: true } : null;
    };
  }

  private isJsonSaveValid(): boolean {
    const raw = this.rawJson.trim();
    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return false;
      if (!parsed.state) return false;
      if (!parsed.variants || typeof parsed.variants !== 'object') return false;
      return Object.keys(parsed.variants).length > 0;
    } catch {
      return false;
    }
  }

  private isCurrentModeFormValid(): boolean {
    const keyControl = this.form.get('key');
    if (!keyControl || keyControl.invalid) return false;

    const mode = this.editorMode();
    if (mode === 'easy' && this.form.get('easyType')!.value === 'string') {
      const onValueControl = this.form.get('easyStringOnValue');
      return !!onValueControl && onValueControl.valid;
    }

    return true;
  }

  private buildEasyTimeTargeting(): Record<string, unknown> | undefined {
    const startDate = this.form.get('easyStartDate')?.value ?? null;
    const startTime = this.form.get('easyStartTime')?.value ?? null;
    const endDate = this.form.get('easyEndDate')?.value ?? null;
    const endTime = this.form.get('easyEndTime')?.value ?? null;

    const start = this.toUnixEpochSeconds(this.combineDateAndTime(startDate, startTime));
    const end = this.toUnixEpochSeconds(this.combineDateAndTime(endDate, endTime));

    if (start === null && end === null) return undefined;

    const varRef = { var: FlagEditorComponent.TIMESTAMP_CONTEXT_VAR };
    const conditions: Record<string, unknown>[] = [];

    if (start !== null) {
      conditions.push({ '>=': [varRef, start] });
    }

    if (end !== null) {
      conditions.push({ '<=': [varRef, end] });
    }

    const condition = conditions.length === 1 ? conditions[0] : { and: conditions };

    return {
      if: [condition, 'on', 'off'],
    };
  }

  private isEasyTimeTargeting(targeting: Record<string, unknown>): boolean {
    return this.parseEasyTimeTargeting(targeting) !== null;
  }

  private parseEasyTimeTargeting(
    targeting: Record<string, unknown> | undefined,
  ): { start?: number; end?: number } | null {
    if (!targeting || Object.keys(targeting).length === 0) return null;

    const ifClause = targeting['if'];
    if (!Array.isArray(ifClause) || ifClause.length < 3) return null;

    if (ifClause[1] !== 'on' || ifClause[2] !== 'off') return null;

    const bounds = this.extractTimestampBounds(ifClause[0]);
    if (!bounds) return null;

    return {
      start: bounds.start,
      end: bounds.end,
    };
  }

  private extractTimestampBounds(value: unknown): { start?: number; end?: number } | null {
    if (!value || typeof value !== 'object') return null;
    const condition = value as Record<string, unknown>;

    if ('>=' in condition) {
      const start = this.readTimestampComparison(condition['>=']);
      return start !== null ? { start } : null;
    }

    if ('<=' in condition) {
      const end = this.readTimestampComparison(condition['<=']);
      return end !== null ? { end } : null;
    }

    if ('and' in condition) {
      const subConditions = condition['and'];
      if (!Array.isArray(subConditions) || subConditions.length === 0) return null;

      let start: number | undefined;
      let end: number | undefined;

      for (const subCondition of subConditions) {
        const parsed = this.extractTimestampBounds(subCondition);
        if (!parsed) return null;
        if (parsed.start !== undefined) start = parsed.start;
        if (parsed.end !== undefined) end = parsed.end;
      }

      if (start === undefined && end === undefined) return null;
      return { start, end };
    }

    return null;
  }

  private readTimestampComparison(value: unknown): number | null {
    if (!Array.isArray(value) || value.length < 2) return null;

    const variableRef = value[0];
    if (!variableRef || typeof variableRef !== 'object') return null;

    const varName = (variableRef as Record<string, unknown>)['var'];
    if (varName !== FlagEditorComponent.TIMESTAMP_CONTEXT_VAR) return null;

    const comparedValue = value[1];
    if (typeof comparedValue === 'number' && Number.isFinite(comparedValue)) {
      return comparedValue;
    }

    return null;
  }

  private parseTimestampDate(value: unknown): Date | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number' && Number.isFinite(value)) {
      const timestampMs = value > 1_000_000_000_000 ? value : value * 1000;
      const parsedFromNumber = new Date(timestampMs);
      return Number.isNaN(parsedFromNumber.getTime()) ? null : parsedFromNumber;
    }

    return null;
  }

  private toTimestampString(value: unknown): string | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }

  private toUnixEpochSeconds(value: unknown): number | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return Math.floor(value.getTime() / 1000);
  }

  private combineDateAndTime(dateValue: unknown, timeValue: unknown): Date | null {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return null;
    if (!(timeValue instanceof Date) || Number.isNaN(timeValue.getTime())) return null;

    return new Date(
      dateValue.getFullYear(),
      dateValue.getMonth(),
      dateValue.getDate(),
      timeValue.getHours(),
      timeValue.getMinutes(),
      timeValue.getSeconds(),
      timeValue.getMilliseconds(),
    );
  }

  private syncJsonState(state: FlagState): void {
    const raw = this.rawJson.trim();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      parsed.state = state;
      this.rawJson = JSON.stringify(parsed, null, 2);
      this.jsonError = null;
    } catch {
      this.jsonError = 'Invalid JSON';
    }
  }
}
