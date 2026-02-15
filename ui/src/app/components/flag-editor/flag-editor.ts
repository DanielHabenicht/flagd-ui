import {
  Component,
  input,
  output,
  OnChanges,
  OnInit,
  computed,
  signal,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
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
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  FlagDefinition,
  FlagEntry,
  FlagState,
  FlagType,
  MetadataMap,
  inferFlagType,
  getDefaultVariants,
  generateEnvironmentVariants,
  isEnvironmentBasedFlag,
  extractEnvironmentStates,
} from '../../models/flag.models';
import { VariantRow } from '../variants-editor/variants-editor';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor';
import { Store } from '@ngxs/store';
import { FlagSchemaAdapter, TimeWindowBounds } from '../../services/flag-schema-adapter';
import { FlagStoreState } from '../../state/flag-store.state';

export type EditorMode = 'interactive' | 'json';

interface TimeWindowFormState {
  startDate: Date | null;
  startTime: Date | null;
  endDate: Date | null;
  endTime: Date | null;
}

@Component({
  selector: 'app-flag-editor',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MetadataEditorComponent,
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
    MatExpansionModule,
    MatTooltipModule,
  ],
  templateUrl: './flag-editor.html',
  styleUrl: './flag-editor.scss',
})
export class FlagEditorComponent implements OnInit, OnChanges {
  private readonly ngxsStore = inject(Store);
  private readonly schemaAdapter = new FlagSchemaAdapter();

  readonly inline = input(false);
  readonly allowMaximize = input(false);
  readonly maximizeIcon = input('open_in_full');
  readonly maximizeTitle = input('Open editor as page');
  readonly flag = input<FlagEntry | null>(null);
  readonly existingKeys = input<string[]>([]);
  readonly showMetadata = input(false);
  readonly save = output<{ key: string; flag: FlagDefinition; originalKey?: string }>();
  readonly cancelled = output<void>();
  readonly maximize = output<void>();

  form!: FormGroup;
  variants = signal<VariantRow[]>([]);
  targeting = signal<Record<string, unknown> | undefined>(undefined);
  metadata = signal<MetadataMap | undefined>(undefined);
  editorMode = signal<EditorMode>('interactive');

  // Environment mode state
  defaultFallbackValue = signal<unknown>(undefined);
  environmentStates = signal<Record<string, unknown>>({});
  environmentTimeWindows = signal<Record<string, TimeWindowFormState>>({});
  globalEnvironmentTimeEnabled = signal(false);
  environmentFilter = signal('');

  // Expose JSON to template for object editing
  readonly JSON = JSON;

  readonly environments = this.ngxsStore.selectSignal(FlagStoreState.currentEnvironments);
  readonly filteredEnvironments = computed(() => {
    const filterValue = this.environmentFilter().trim().toLowerCase();
    const allEnvironments = this.environments();
    if (!filterValue) return allEnvironments;

    return allEnvironments.filter((environment) => {
      const aliases = Array.isArray(environment.aliases) ? environment.aliases : [];
      const haystack = [environment.displayName, environment.name, ...aliases]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.toLowerCase());
      return haystack.some((value) => value.includes(filterValue));
    });
  });
  readonly hasEnvironments = computed(() => this.environments().length > 0);
  readonly hasMultipleEnvironments = computed(() => this.environments().length > 4);
  readonly hasDefinitionTargeting = computed(() => {
    const flag = this.flag();
    if (!flag?.targeting) return false;
    return Object.keys(flag.targeting).length > 0;
  });
  readonly showGlobalEnvironmentValueOnly = computed(() => !this.hasDefinitionTargeting());

  readonly allEnvironmentsSameValue = computed(() => {
    const environments = this.environments();
    if (environments.length === 0) return true;

    const states = this.environmentStates();
    const fallback = this.defaultFallbackValue();

    return environments.every((env) => {
      const envValue = states[env.name.toLowerCase()];
      // Use JSON.stringify for deep comparison
      return JSON.stringify(envValue) === JSON.stringify(fallback);
    });
  });

  readonly canCollapseEnvironmentOverrides = computed(() => this.allEnvironmentsSameValue());

  showEnvironmentOverrides = signal(false);
  showGlobalTimeWindow = signal(false);

  // JSON editor state
  rawJson = '';
  jsonError: string | null = null;
  private initialEditorSnapshot = '';

  readonly isEditing = computed(() => this.flag() !== null);

  readonly variantNames = computed(() =>
    this.variants()
      .map((v) => v.name)
      .filter(Boolean),
  );

  readonly interactiveModeAvailable = computed(() => {
    if (this.hasEnvironments()) return true;

    const variants = this.variants();
    const targeting = this.targeting();
    const flagType = this.form?.get('flagType')?.value as FlagType | undefined;

    if (!flagType || (flagType !== 'boolean' && flagType !== 'string')) return false;
    if (targeting && Object.keys(targeting).length > 0 && !this.isInteractiveTimeTargeting(targeting))
      return false;
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
      // Interactive mode fields
      interactiveType: new FormControl<'boolean' | 'string'>(
        initialType === 'boolean' || initialType === 'string' ? initialType : 'boolean',
        { nonNullable: true },
      ),
      interactiveStringValue: new FormControl<string>(
        initialType === 'string' && initialVariants.length > 0
          ? String(initialVariants[0]?.value ?? '')
          : '',
      ),
      interactiveStringOnValue: new FormControl<string>(
        initialType === 'string'
          ? String(initialVariants.find((variant) => variant.name === 'on')?.value ?? '')
          : '',
      ),
      interactiveStringOffValue: new FormControl<string>(
        initialType === 'string'
          ? String(initialVariants.find((variant) => variant.name === 'off')?.value ?? '')
          : '',
      ),
      // Default fallback value controls
      defaultBooleanValue: new FormControl<boolean>(false, { nonNullable: true }),
      defaultStringValue: new FormControl<string>(''),
      defaultNumberValue: new FormControl<number>(0, { nonNullable: true }),
      defaultObjectValue: new FormControl<string>('{}'),
      interactiveStartDate: new FormControl<Date | null>(null),
      interactiveStartTime: new FormControl<Date | null>(null),
      interactiveEndDate: new FormControl<Date | null>(null),
      interactiveEndTime: new FormControl<Date | null>(null),
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

    const envs = this.environments();
    const isEnvironmentFlag = !!f && envs.length > 0 && isEnvironmentBasedFlag(f, envs);

    if (envs.length > 0) {
      if (isEnvironmentFlag) {
        const extractedStates = extractEnvironmentStates(f!, envs, nextType);
        this.environmentStates.set(extractedStates);
        // Set the default/fallback value from the variant specified in defaultVariant
        const defaultVariantName = f!.defaultVariant || 'off';
        const defaultVariantValue = f!.variants[defaultVariantName];
        this.defaultFallbackValue.set(defaultVariantValue);
      } else {
        const defaultValue = this.getDefaultValueForType(nextType);
        this.defaultFallbackValue.set(defaultValue);
        const defaultStates: Record<string, unknown> = {};
        for (const env of envs) {
          defaultStates[env.name.toLowerCase()] = defaultValue;
        }
        this.environmentStates.set(defaultStates);
      }
    }

    const parsedInteractiveTimeTargeting = this.parseInteractiveTimeTargeting(f?.targeting);
    const parsedEnvironmentTiming = this.parseEnvironmentTimingTargeting(f?.targeting);

    const globalTimeBounds = isEnvironmentFlag
      ? parsedEnvironmentTiming.global
      : parsedInteractiveTimeTargeting;

    const hasGlobalTimeWindow =
      !!globalTimeBounds &&
      (globalTimeBounds.start !== undefined || globalTimeBounds.end !== undefined);

    this.globalEnvironmentTimeEnabled.set(hasGlobalTimeWindow);
    this.showGlobalTimeWindow.set(hasGlobalTimeWindow);

    const environmentTimeWindows: Record<string, TimeWindowFormState> = {};
    for (const env of envs) {
      const envName = env.name.toLowerCase();
      const bounds = parsedEnvironmentTiming.perEnvironment[envName];
      if (bounds && (bounds.start !== undefined || bounds.end !== undefined)) {
        environmentTimeWindows[envName] = this.timeWindowStateFromBounds(bounds);
      }
    }
    this.environmentTimeWindows.set(environmentTimeWindows);

    const defaultValue = this.defaultFallbackValue();
    this.form.patchValue(
      {
        key: f?.key ?? '',
        state: f?.state ?? 'ENABLED',
        flagType: nextType,
        defaultVariant: f?.defaultVariant ?? '',
        interactiveType: nextType === 'boolean' || nextType === 'string' ? nextType : 'boolean',
        interactiveStringValue:
          nextType === 'string' && nextVariants.length > 0
            ? String(nextVariants[0]?.value ?? '')
            : '',
        interactiveStringOnValue:
          nextType === 'string'
            ? String(nextVariants.find((variant) => variant.name === 'on')?.value ?? '')
            : '',
        interactiveStringOffValue:
          nextType === 'string'
            ? String(nextVariants.find((variant) => variant.name === 'off')?.value ?? '')
            : '',
        defaultBooleanValue: defaultValue === true ? true : false,
        defaultStringValue: typeof defaultValue === 'string' ? defaultValue : '',
        defaultNumberValue: typeof defaultValue === 'number' ? defaultValue : 0,
        defaultObjectValue:
          typeof defaultValue === 'object' &&
          defaultValue !== null &&
          !(defaultValue instanceof Array)
            ? JSON.stringify(defaultValue, null, 2)
            : '{}',
        interactiveStartDate: this.parseTimestampDate(globalTimeBounds?.start),
        interactiveStartTime: this.parseTimestampDate(globalTimeBounds?.start),
        interactiveEndDate: this.parseTimestampDate(globalTimeBounds?.end),
        interactiveEndTime: this.parseTimestampDate(globalTimeBounds?.end),
      },
      { emitEvent: false },
    );

    this.form.get('key')?.updateValueAndValidity({ emitEvent: false });

    this.updateInteractiveStringValidators();

    // Determine editor mode
    if (f) {
      if (isEnvironmentFlag) {
        this.editorMode.set('interactive');
      } else {
        const isSimpleType = nextType === 'boolean' || nextType === 'string';
        const hasUnsupportedTargeting =
          !!f.targeting &&
          Object.keys(f.targeting).length > 0 &&
          !this.isInteractiveTimeTargeting(f.targeting);
        const isSimpleVariants = this.isSimpleFlagStructure(nextType, nextVariants);

        if (isSimpleType && !hasUnsupportedTargeting && isSimpleVariants) {
          this.editorMode.set('interactive');
        } else {
          this.editorMode.set('json');
        }
      }
    } else {
      this.editorMode.set('interactive');
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

    if (mode === 'interactive') {
      // After applying JSON (if coming from json), interactive mode is always available
      if (!this.interactiveModeAvailable()) return;
    }

    if (mode === 'json') {
      this.syncToJson();
    }

    this.editorMode.set(mode);
  }

  // --- Interactive mode ---

  onInteractiveTypeChange(): void {
    const interactiveType = this.form.get('interactiveType')!.value as 'boolean' | 'string';
    this.form.get('flagType')!.setValue(interactiveType);
    this.updateInteractiveStringValidators();
    if (interactiveType === 'boolean') {
      this.variants.set(getDefaultVariants('boolean'));
      this.form.get('defaultVariant')!.setValue('on');
    } else {
      this.variants.set([
        { name: 'on', value: '' },
        { name: 'off', value: '' },
      ]);
      this.form.get('defaultVariant')!.setValue('on');
      this.form.get('interactiveStringValue')!.setValue('');
      this.form.get('interactiveStringOnValue')!.setValue('');
      this.form.get('interactiveStringOffValue')!.setValue('');
    }
  }

  onFlagTypeToggleChange(value: FlagType): void {
    const mode = this.editorMode();

    if (mode !== 'interactive') return;

    if (this.hasEnvironments()) {
      this.form.get('flagType')!.setValue(value);
      this.onEnvironmentTypeChange();
      return;
    }

    if (value === 'boolean' || value === 'string') {
      this.form.get('interactiveType')!.setValue(value);
      this.onInteractiveTypeChange();
      return;
    }

    // For other types in interactive mode without environments, update variants and switch to JSON if needed
    this.form.get('flagType')!.setValue(value);
    this.onTypeChange();
  }

  onInteractiveStringValueChange(): void {
    const onValue = this.form.get('interactiveStringOnValue')!.value ?? '';
    const offValue = this.form.get('interactiveStringOffValue')!.value ?? '';
    this.variants.set([
      { name: 'on', value: onValue },
      { name: 'off', value: offValue },
    ]);
  }

  onInteractiveDefaultChange(value: string): void {
    this.form.get('defaultVariant')!.setValue(value);
  }

  isInteractiveModeGlobalBooleanOn(): boolean {
    if (this.hasEnvironments()) {
      return this.getGlobalEnvironmentValue() === true;
    }

    return this.form.get('defaultVariant')!.value === 'on';
  }

  onInteractiveModeGlobalBooleanChange(checked: boolean): void {
    if (this.hasEnvironments()) {
      this.onGlobalEnvironmentValueChange(checked);
      return;
    }

    this.onInteractiveDefaultChange(checked ? 'on' : 'off');
  }

  getInteractiveModeGlobalBooleanLabel(): string {
    return this.isInteractiveModeGlobalBooleanOn() ? 'ON' : 'OFF';
  }

  resetInteractiveTimeWindow(): void {
    this.form.get('interactiveStartDate')!.setValue(null);
    this.form.get('interactiveStartTime')!.setValue(null);
    this.form.get('interactiveEndDate')!.setValue(null);
    this.form.get('interactiveEndTime')!.setValue(null);
  }

  addGlobalEnvironmentTimeWindow(): void {
    this.globalEnvironmentTimeEnabled.set(true);
  }

  removeGlobalEnvironmentTimeWindow(): void {
    this.globalEnvironmentTimeEnabled.set(false);
    this.resetInteractiveTimeWindow();
  }

  hasEnvironmentTimeWindow(envName: string): boolean {
    return !!this.environmentTimeWindows()[envName.toLowerCase()];
  }

  getEnvironmentTimeWindow(envName: string): TimeWindowFormState {
    return (
      this.environmentTimeWindows()[envName.toLowerCase()] ?? {
        startDate: null,
        startTime: null,
        endDate: null,
        endTime: null,
      }
    );
  }

  addEnvironmentTimeWindow(envName: string): void {
    const key = envName.toLowerCase();
    const windows = { ...this.environmentTimeWindows() };
    windows[key] = windows[key] ?? {
      startDate: null,
      startTime: null,
      endDate: null,
      endTime: null,
    };
    this.environmentTimeWindows.set(windows);
  }

  removeEnvironmentTimeWindow(envName: string): void {
    const key = envName.toLowerCase();
    const windows = { ...this.environmentTimeWindows() };
    delete windows[key];
    this.environmentTimeWindows.set(windows);
  }

  onEnvironmentTimeWindowChange(
    envName: string,
    field: keyof TimeWindowFormState,
    value: Date | null,
  ): void {
    const key = envName.toLowerCase();
    const windows = { ...this.environmentTimeWindows() };
    const current = windows[key] ?? {
      startDate: null,
      startTime: null,
      endDate: null,
      endTime: null,
    };
    windows[key] = {
      ...current,
      [field]: value,
    };
    this.environmentTimeWindows.set(windows);
  }

  // --- Type and variants ---

  onTypeChange(): void {
    const newType = this.form.get('flagType')!.value as FlagType;
    this.variants.set(getDefaultVariants(newType));
    this.form.get('defaultVariant')!.setValue('');
  }

  onMetadataChange(metadata: MetadataMap | undefined): void {
    this.metadata.set(metadata);
  }

  // --- JSON mode ---

  onJsonInput(value: string): void {
    this.rawJson = value;
    this.jsonError = this.schemaAdapter.isValidJson(value) ? null : 'Invalid JSON';
  }

  formatJson(): void {
    const formatted = this.schemaAdapter.formatJson(this.rawJson);
    if (formatted.ok) {
      this.rawJson = formatted.value;
      this.jsonError = null;
    } else {
      this.jsonError = formatted.error;
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

    if (mode === 'interactive') {
      if (this.hasEnvironments()) {
        if (!this.isCurrentModeFormValid() || this.keyAlreadyExists() || !key) return;

        const flag = this.buildEnvironmentBasedFlag();

        this.save.emit({
          key,
          flag,
          originalKey: this.flag()?.key,
        });
        return;
      }
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

    if (mode === 'interactive') {
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
    this.cancelled.emit();
  }

  onMaximize(): void {
    this.maximize.emit();
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

  private syncToJson(): void {
    const variantsObj: Record<string, unknown> = {};
    for (const v of this.variants()) {
      if (v.name) {
        variantsObj[v.name] = v.value;
      }
    }

    this.rawJson = this.schemaAdapter.serializeFlagDefinition({
      state: this.form.get('state')!.value,
      variants: variantsObj,
      defaultVariant: this.form.get('defaultVariant')!.value,
      targeting: this.targeting(),
      metadata: this.metadata(),
    });
    this.jsonError = null;
  }

  private applyJsonToForm(): boolean {
    const result = this.schemaAdapter.parseEditorStateFromJson(this.rawJson);
    if (!result.ok) {
      this.jsonError = result.error;
      return false;
    }

    const parsed = result.value;
    this.form.get('state')!.setValue(parsed.state);

    if (parsed.variants) {
      this.variants.set(parsed.variants as VariantRow[]);
    }

    if (parsed.flagType) {
      this.form.get('flagType')!.setValue(parsed.flagType);
    }

    if (parsed.easyType) {
      this.form.get('interactiveType')!.setValue(parsed.easyType);
    }

    if (parsed.hasDefaultVariant) {
      this.form.get('defaultVariant')!.setValue(parsed.defaultVariant ?? '');
    }

    this.targeting.set(parsed.targeting);
    this.metadata.set(parsed.metadata);

    this.jsonError = null;
    return true;
  }

  private saveFromJson(): void {
    const key = String(this.form.get('key')!.value ?? '').trim();
    if (!key || this.form.get('key')!.invalid || this.keyAlreadyExists()) return;

    const result = this.schemaAdapter.parseFlagForSave(this.rawJson);
    if (!result.ok) {
      this.jsonError = result.error;
      return;
    }

    this.save.emit({
      key,
      flag: result.value,
      originalKey: this.flag()?.key,
    });
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
    const interactiveType = this.form?.get('interactiveType')?.value ?? 'boolean';
    const interactiveStringValue = this.form?.get('interactiveStringValue')?.value ?? '';
    const interactiveStringOnValue = this.form?.get('interactiveStringOnValue')?.value ?? '';
    const interactiveStringOffValue = this.form?.get('interactiveStringOffValue')?.value ?? '';
    const interactiveStartTime =
      this.toTimestampString(
        this.combineDateAndTime(
          this.form?.get('interactiveStartDate')?.value ?? null,
          this.form?.get('interactiveStartTime')?.value ?? null,
        ),
      ) ?? '';
    const interactiveEndTime =
      this.toTimestampString(
        this.combineDateAndTime(
          this.form?.get('interactiveEndDate')?.value ?? null,
          this.form?.get('interactiveEndTime')?.value ?? null,
        ),
      ) ?? '';

    return JSON.stringify({
      key,
      state,
      flagType,
      defaultVariant,
      interactiveType,
      interactiveStringValue,
      interactiveStringOnValue,
      interactiveStringOffValue,
      interactiveStartTime,
      interactiveEndTime,
      editorMode: this.editorMode(),
      hasEnvironments: this.hasEnvironments(),
      globalEnvironmentTimeEnabled: this.globalEnvironmentTimeEnabled(),
      defaultFallbackValue: this.defaultFallbackValue(),
      environmentStates: this.environmentStates(),
      environmentTimeWindows: this.serializeEnvironmentTimeWindows(),
      variants: this.variants(),
      targeting: this.targeting() ?? null,
      metadata: this.metadata() ?? null,
      rawJson: this.rawJson.trim(),
    });
  }

  private updateInteractiveStringValidators(): void {
    const interactiveType = this.form.get('interactiveType')!.value as 'boolean' | 'string';
    const onControl = this.form.get('interactiveStringOnValue');
    const offControl = this.form.get('interactiveStringOffValue');

    if (!onControl || !offControl) return;

    if (interactiveType === 'string') {
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

    return this.schemaAdapter.isJsonSaveValid(raw);
  }

  private isCurrentModeFormValid(): boolean {
    const keyControl = this.form.get('key');
    if (!keyControl || keyControl.invalid) return false;

    const mode = this.editorMode();
    if (
      mode === 'interactive' &&
      !this.hasEnvironments() &&
      this.form.get('interactiveType')!.value === 'string'
    ) {
      const onValueControl = this.form.get('interactiveStringOnValue');
      return !!onValueControl && onValueControl.valid;
    }

    return true;
  }

  private buildInteractiveTimeTargeting(): Record<string, unknown> | undefined {
    return this.schemaAdapter.buildEasyTimeTargeting(this.getInteractiveTimeWindowBounds());
  }

  private isInteractiveTimeTargeting(targeting: Record<string, unknown>): boolean {
    return this.schemaAdapter.isEasyTimeTargeting(targeting);
  }

  private parseInteractiveTimeTargeting(
    targeting: Record<string, unknown> | undefined,
  ): { start?: number; end?: number } | null {
    return this.schemaAdapter.parseEasyTimeTargeting(targeting);
  }

  private parseTimestampDate(value: unknown): Date | null {
    if (value === null || value === undefined) {
      return null;
    }

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
    const result = this.schemaAdapter.syncJsonState(this.rawJson, state);
    if (result.ok) {
      this.rawJson = result.value;
      this.jsonError = null;
      return;
    }
    this.jsonError = result.error;
  }

  // Environment mode helpers
  private getDefaultValueForType(flagType: FlagType, enabled = true): unknown {
    switch (flagType) {
      case 'boolean':
        return enabled;
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'object':
        return {};
    }
  }

  onEnvironmentValueChange(envName: string, value: unknown): void {
    const states = { ...this.environmentStates() };
    states[envName] = value;
    this.environmentStates.set(states);
  }

  getGlobalEnvironmentValue(): unknown {
    const environments = this.environments();
    if (environments.length === 0) {
      const flagType = this.form.get('flagType')?.value as FlagType;
      return this.getDefaultValueForType(flagType ?? 'boolean');
    }

    const firstEnvironment = environments[0].name.toLowerCase();
    const firstValue = this.environmentStates()[firstEnvironment];
    if (firstValue !== undefined) return firstValue;

    const flagType = this.form.get('flagType')?.value as FlagType;
    return this.getDefaultValueForType(flagType ?? 'boolean');
  }

  getDefaultFallbackValue(): unknown {
    return this.defaultFallbackValue();
  }

  onDefaultFallbackValueChange(value: unknown): void {
    this.defaultFallbackValue.set(value);
  }

  onGlobalEnvironmentValueChange(value: unknown): void {
    // This now just updates all environments at once (they share the same value)
    const nextStates: Record<string, unknown> = {};
    for (const env of this.environments()) {
      nextStates[env.name.toLowerCase()] = value;
    }
    this.environmentStates.set(nextStates);
  }

  onEnvironmentTypeChange(): void {
    const flagType = this.form.get('flagType')?.value as FlagType;
    // Reset all environment values and default fallback to defaults for the new type
    const defaultValue = this.getDefaultValueForType(flagType);
    this.defaultFallbackValue.set(defaultValue);
    const states: Record<string, unknown> = {};
    for (const env of this.environments()) {
      states[env.name.toLowerCase()] = defaultValue;
    }
    this.environmentStates.set(states);
  }

  onEnvironmentFilterInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.environmentFilter.set(target?.value ?? '');
  }

  buildEnvironmentBasedFlag(): FlagDefinition {
    const flagType = this.form.get('flagType')!.value as FlagType;
    const envs = this.environments();
    const states = this.environmentStates();

    // Generate variants
    const variants = generateEnvironmentVariants(envs, flagType, states);

    // Generate targeting
    const targeting = this.buildEnvironmentTimeAwareTargeting();

    return {
      state: this.form.get('state')!.value as FlagState,
      variants,
      defaultVariant: 'off',
      targeting: Object.keys(targeting).length > 0 ? targeting : undefined,
      metadata:
        this.metadata() && Object.keys(this.metadata()!).length > 0 ? this.metadata() : undefined,
    };
  }

  private buildEnvironmentTimeAwareTargeting(): Record<string, unknown> {
    const perEnvironmentBounds: Record<string, TimeWindowBounds | null> = {};
    for (const env of this.environments()) {
      const envName = env.name.toLowerCase();
      perEnvironmentBounds[envName] = this.getEnvironmentTimeWindowBounds(envName);
    }

    return this.schemaAdapter.buildEnvironmentTimeAwareTargeting(
      this.environments(),
      this.getGlobalTimeWindowBounds(),
      perEnvironmentBounds,
    );
  }

  private getInteractiveTimeWindowBounds(): TimeWindowBounds | null {
    const startDate = this.form.get('interactiveStartDate')?.value ?? null;
    const startTime = this.form.get('interactiveStartTime')?.value ?? null;
    const endDate = this.form.get('interactiveEndDate')?.value ?? null;
    const endTime = this.form.get('interactiveEndTime')?.value ?? null;

    const start = this.toUnixEpochSeconds(this.combineDateAndTime(startDate, startTime));
    const end = this.toUnixEpochSeconds(this.combineDateAndTime(endDate, endTime));

    if (start === null && end === null) return null;

    const bounds: TimeWindowBounds = {};
    if (start !== null) bounds.start = start;
    if (end !== null) bounds.end = end;
    return bounds;
  }

  private getGlobalTimeWindowBounds(): TimeWindowBounds | null {
    if (!this.globalEnvironmentTimeEnabled()) return null;

    const startDate = this.form.get('interactiveStartDate')?.value ?? null;
    const startTime = this.form.get('interactiveStartTime')?.value ?? null;
    const endDate = this.form.get('interactiveEndDate')?.value ?? null;
    const endTime = this.form.get('interactiveEndTime')?.value ?? null;

    const start = this.toUnixEpochSeconds(this.combineDateAndTime(startDate, startTime));
    const end = this.toUnixEpochSeconds(this.combineDateAndTime(endDate, endTime));

    if (start === null && end === null) return null;

    const bounds: TimeWindowBounds = {};
    if (start !== null) bounds.start = start;
    if (end !== null) bounds.end = end;
    return bounds;
  }

  private getEnvironmentTimeWindowBounds(envName: string): TimeWindowBounds | null {
    const state = this.environmentTimeWindows()[envName.toLowerCase()];
    if (!state) return null;

    const start = this.toUnixEpochSeconds(
      this.combineDateAndTime(state.startDate, state.startTime),
    );
    const end = this.toUnixEpochSeconds(this.combineDateAndTime(state.endDate, state.endTime));

    if (start === null && end === null) return null;

    const bounds: TimeWindowBounds = {};
    if (start !== null) bounds.start = start;
    if (end !== null) bounds.end = end;
    return bounds;
  }

  private parseEnvironmentTimingTargeting(targeting: Record<string, unknown> | undefined): {
    global?: TimeWindowBounds;
    perEnvironment: Record<string, TimeWindowBounds>;
  } {
    return this.schemaAdapter.parseEnvironmentTimingTargeting(targeting);
  }

  private timeWindowStateFromBounds(bounds: TimeWindowBounds): TimeWindowFormState {
    return {
      startDate: this.parseTimestampDate(bounds.start),
      startTime: this.parseTimestampDate(bounds.start),
      endDate: this.parseTimestampDate(bounds.end),
      endTime: this.parseTimestampDate(bounds.end),
    };
  }

  private serializeEnvironmentTimeWindows(): Record<string, TimeWindowBounds | null> {
    const serialized: Record<string, TimeWindowBounds | null> = {};
    for (const env of this.environments()) {
      const envName = env.name.toLowerCase();
      serialized[envName] = this.getEnvironmentTimeWindowBounds(envName);
    }
    return serialized;
  }
}
