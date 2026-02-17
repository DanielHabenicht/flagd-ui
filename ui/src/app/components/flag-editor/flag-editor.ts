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
  FlagState,
  FlagType,
  DisplayFlag,
  ValueDefinition,
  TimeWindowValue,
} from '../../models/abstraction/flagd-abstraction-models';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor';
import { Store } from '@ngxs/store';
import { FlagStoreState } from '../../state/current-flag-store.state';

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

  readonly inline = input(false);
  readonly allowMaximize = input(false);
  readonly maximizeIcon = input('open_in_full');
  readonly maximizeTitle = input('Open editor as page');
  readonly flag = input<DisplayFlag | null>(null);
  readonly existingKeys = input<string[]>([]);
  readonly showMetadata = input(false);
  readonly save = output<{ key: string; flag: DisplayFlag; originalKey?: string }>();
  readonly cancelled = output<void>();
  readonly maximize = output<void>();

  form!: FormGroup;
  flagValue = signal<unknown>(null);
  perEnvironmentDefinitions = signal<Record<string, ValueDefinition<unknown>>>({});
  globalTimeWindow = signal<TimeWindowValue<unknown> | undefined>(undefined);
  flagType = signal<FlagType>('boolean');
  metadata = signal<Record<string, string | number | boolean> | undefined>(undefined);
  editorMode = signal<EditorMode>('interactive');

  // Environment mode state
  environmentTimeWindows = signal<Record<string, TimeWindowFormState>>({});
  globalEnvironmentTimeEnabled = signal(false);
  environmentFilter = signal('');

  // Expose JSON to template for object editing
  readonly JSON = JSON;

  readonly environments = this.ngxsStore.selectSignal(FlagStoreState.environments);
  readonly filteredEnvironments = computed(() => {
    const filterValue = this.environmentFilter().trim().toLowerCase();
    const allEnvironments = this.environments();
    if (!filterValue) return allEnvironments;

    return allEnvironments.filter((environment) => {
      const aliases = Array.isArray(environment.aliases) ? environment.aliases : [];
      const haystack = [environment.displayName, ...aliases]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.toLowerCase());
      return haystack.some((value) => value.includes(filterValue));
    });
  });
  readonly hasEnvironments = computed(() => this.environments().length > 0);
  readonly hasMultipleEnvironments = computed(() => this.environments().length > 4);
  readonly hasDefinitionTargeting = computed(() => {
    const perEnvDefs = this.perEnvironmentDefinitions();
    const globalTW = this.globalTimeWindow();
    return Object.keys(perEnvDefs).length > 0 || !!globalTW;
  });
  readonly showGlobalEnvironmentValueOnly = computed(() => !this.hasDefinitionTargeting());

  readonly canCollapseEnvironmentOverrides = computed(() => {
    const environments = this.environments();
    if (environments.length === 0) return true;

    const perEnvDefs = this.perEnvironmentDefinitions();
    const globalValue = this.flagValue();

    return environments.every((env) => {
      const envDef = perEnvDefs[env.displayName];
      return !envDef || JSON.stringify(envDef.value) === JSON.stringify(globalValue);
    });
  });

  showEnvironmentOverrides = signal(false);
  showGlobalTimeWindow = signal(false);

  // JSON editor state
  rawJson = '';
  jsonError: string | null = null;
  private initialEditorSnapshot = '';

  readonly isEditing = computed(() => this.flag() !== null);

  readonly interactiveModeAvailable = computed(() => {
    if (this.hasEnvironments()) return true;

    const flagType = this.flagType();
    const globalTW = this.globalTimeWindow();

    if (!(flagType === 'boolean' || flagType === 'string')) return false;
    if (globalTW) return true; // Can still edit simple time windows
    return true;
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

    return true;
  }

  ngOnInit(): void {
    const f = this.flag();

    const initialType: FlagType = f?.type ?? 'boolean';
    const initialValue = f?.value ?? this.getDefaultValueForType(initialType);

    this.flagType.set(initialType);
    this.flagValue.set(initialValue);
    this.perEnvironmentDefinitions.set(f?.perEnvironmentDefinitions ?? {});
    this.globalTimeWindow.set(f?.globalTimeWindow);
    this.metadata.set(f?.metadata);

    this.form = new FormGroup({
      key: new FormControl(f?.key ?? '', [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9._-]+$/),
        this.duplicateKeyValidator(),
      ]),
      state: new FormControl<FlagState>(f?.state ?? 'ENABLED', { nonNullable: true }),
      flagType: new FormControl<FlagType>(initialType, { nonNullable: true }),
      // Value controls for different types
      booleanValue: new FormControl<boolean>(
        initialType === 'boolean' ? ((initialValue as boolean) ?? false) : false,
        { nonNullable: true },
      ),
      stringValue: new FormControl<string>(
        initialType === 'string' ? String(initialValue ?? '') : '',
      ),
      numberValue: new FormControl<number>(
        initialType === 'number' ? ((initialValue as number) ?? 0) : 0,
        { nonNullable: true },
      ),
      objectValue: new FormControl<string>(
        initialType === 'object' && initialValue && typeof initialValue === 'object'
          ? JSON.stringify(initialValue, null, 2)
          : '{}',
      ),
      // Global time window
      globalStartDate: new FormControl<Date | null>(null),
      globalStartTime: new FormControl<Date | null>(null),
      globalEndDate: new FormControl<Date | null>(null),
      globalEndTime: new FormControl<Date | null>(null),
    });

    this.applyFlagToForm(f);
  }

  ngOnChanges(): void {
    if (!this.form) return;
    this.applyFlagToForm(this.flag());
  }

  private applyFlagToForm(f: DisplayFlag | null): void {
    if (!f) {
      this.form.reset({ state: 'ENABLED', flagType: 'boolean' });
      this.flagType.set('boolean');
      this.flagValue.set(this.getDefaultValueForType('boolean'));
      this.perEnvironmentDefinitions.set({});
      this.globalTimeWindow.set(undefined);
      this.metadata.set(undefined);
      return;
    }

    const flagType = f.type;
    const shouldShowEnvironments = this.hasEnvironments();

    this.flagType.set(flagType);
    this.flagValue.set(f.value);
    this.perEnvironmentDefinitions.set(f.perEnvironmentDefinitions ?? {});
    this.globalTimeWindow.set(f.globalTimeWindow);
    this.metadata.set(f.metadata);

    // Update form value controls based on type
    const valueByType: Record<FlagType, unknown> = {
      boolean: flagType === 'boolean' ? ((f.value as boolean) ?? false) : false,
      string: flagType === 'string' ? String(f.value ?? '') : '',
      number: flagType === 'number' ? ((f.value as number) ?? 0) : 0,
      object:
        flagType === 'object' && f.value && typeof f.value === 'object'
          ? JSON.stringify(f.value, null, 2)
          : '{}',
    };

    // Update global time window from globalTimeWindow
    let globalStartDate: Date | null = null;
    let globalEndDate: Date | null = null;
    if (f.globalTimeWindow?.timeWindow) {
      const tw = f.globalTimeWindow.timeWindow;
      globalStartDate = tw.startTime ?? null;
      globalEndDate = tw.endTime ?? null;
    }

    this.form.patchValue(
      {
        key: f.key,
        state: f.state,
        flagType: flagType,
        booleanValue: valueByType.boolean,
        stringValue: valueByType.string,
        numberValue: valueByType.number,
        objectValue: valueByType.object,
        globalStartDate,
        globalStartTime: globalStartDate,
        globalEndDate,
        globalEndTime: globalEndDate,
      },
      { emitEvent: false },
    );

    this.form.get('key')?.updateValueAndValidity({ emitEvent: false });

    // Determine editor mode
    if (shouldShowEnvironments && Object.keys(this.perEnvironmentDefinitions()).length > 0) {
      this.editorMode.set('interactive');
    } else if (this.globalTimeWindow()) {
      this.editorMode.set('interactive');
    } else {
      this.editorMode.set('interactive'); // Default to interactive for simple flags
    }

    // Load time windows from perEnvironmentDefinitions
    const envTimeWindows: Record<string, TimeWindowFormState> = {};
    for (const [envName, envDef] of Object.entries(this.perEnvironmentDefinitions())) {
      if (envDef.timeWindow) {
        envTimeWindows[envName.toLowerCase()] = {
          startDate: envDef.timeWindow.startTime ?? null,
          startTime: envDef.timeWindow.startTime ?? null,
          endDate: envDef.timeWindow.endTime ?? null,
          endTime: envDef.timeWindow.endTime ?? null,
        };
      }
    }
    this.environmentTimeWindows.set(envTimeWindows);
    this.globalEnvironmentTimeEnabled.set(!!f.globalTimeWindow?.timeWindow);
    this.showGlobalTimeWindow.set(!!f.globalTimeWindow?.timeWindow);

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

  onFlagTypeChange(newTypeValue?: FlagType): void {
    const newType = (newTypeValue ?? this.form.get('flagType')!.value) as FlagType;
    this.form.patchValue({ flagType: newType });
    this.flagType.set(newType);
    this.flagValue.set(this.getDefaultValueForType(newType));

    // Update form controls for the new type
    const newValue = this.getDefaultValueForType(newType);
    this.form.patchValue({
      booleanValue: newType === 'boolean' ? (newValue as boolean) : false,
      stringValue: newType === 'string' ? String(newValue ?? '') : '',
      numberValue: newType === 'number' ? (newValue as number) : 0,
      objectValue: newType === 'object' ? JSON.stringify(newValue, null, 2) : '{}',
    });
  }

  onValueChange(eventValue?: unknown): void {
    const flagType = this.flagType();
    let newValue: unknown;

    if (eventValue !== undefined) {
      // Value passed from event (e.g., checkbox checked, input value)
      // Update the corresponding form control
      switch (flagType) {
        case 'boolean':
          this.form.patchValue({ booleanValue: eventValue });
          newValue = eventValue;
          break;
        case 'string':
          this.form.patchValue({ stringValue: eventValue });
          newValue = eventValue;
          break;
        case 'number':
          this.form.patchValue({ numberValue: eventValue });
          newValue = eventValue;
          break;
        case 'object':
          this.form.patchValue({ objectValue: eventValue });
          try {
            newValue = JSON.parse(String(eventValue));
          } catch {
            newValue = {};
          }
          break;
      }
    } else {
      // Read from form (for environment value changes)
      switch (flagType) {
        case 'boolean':
          newValue = this.form.get('booleanValue')!.value;
          break;
        case 'string':
          newValue = this.form.get('stringValue')!.value;
          break;
        case 'number':
          newValue = this.form.get('numberValue')!.value;
          break;
        case 'object': {
          const objStr = this.form.get('objectValue')!.value;
          try {
            newValue = JSON.parse(objStr);
          } catch {
            newValue = {};
          }
          break;
        }
      }
    }

    this.flagValue.set(newValue);
  }

  onMetadataChange(metadata: Record<string, string | number | boolean> | undefined): void {
    this.metadata.set(metadata);
  }

  addGlobalEnvironmentTimeWindow(): void {
    this.globalEnvironmentTimeEnabled.set(true);
  }

  removeGlobalEnvironmentTimeWindow(): void {
    this.globalEnvironmentTimeEnabled.set(false);
    this.form.patchValue({
      globalStartDate: null,
      globalStartTime: null,
      globalEndDate: null,
      globalEndTime: null,
    });
  }

  hasEnvironmentTimeWindow(envDisplayName: string): boolean {
    return !!this.environmentTimeWindows()[envDisplayName.toLowerCase()];
  }

  getEnvironmentTimeWindow(envDisplayName: string): TimeWindowFormState {
    return (
      this.environmentTimeWindows()[envDisplayName.toLowerCase()] ?? {
        startDate: null,
        startTime: null,
        endDate: null,
        endTime: null,
      }
    );
  }

  addEnvironmentTimeWindow(envDisplayName: string): void {
    const key = envDisplayName.toLowerCase();
    const windows = { ...this.environmentTimeWindows() };
    windows[key] = windows[key] ?? {
      startDate: null,
      startTime: null,
      endDate: null,
      endTime: null,
    };
    this.environmentTimeWindows.set(windows);
  }

  removeEnvironmentTimeWindow(envDisplayName: string): void {
    const key = envDisplayName.toLowerCase();
    const windows = { ...this.environmentTimeWindows() };
    delete windows[key];
    this.environmentTimeWindows.set(windows);
  }

  onEnvironmentTimeWindowChange(
    envDisplayName: string,
    field: keyof TimeWindowFormState,
    value: Date | null,
  ): void {
    const key = envDisplayName.toLowerCase();
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

  onEnvironmentValueChange(envDisplayName: string, value: unknown): void {
    const perEnvDefs = { ...this.perEnvironmentDefinitions() };
    const existing = perEnvDefs[envDisplayName];
    perEnvDefs[envDisplayName] = {
      value,
      timeWindow: existing?.timeWindow,
    };
    this.perEnvironmentDefinitions.set(perEnvDefs);
  }

  getEnvironmentValue(envDisplayName: string): unknown {
    const perEnvDef = this.perEnvironmentDefinitions()[envDisplayName];
    return perEnvDef?.value ?? this.flagValue();
  }

  onEnvironmentFilterInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.environmentFilter.set(target?.value ?? '');
  }

  // --- JSON mode ---

  onJsonInput(value: string): void {
    this.rawJson = value;
    this.jsonError = this.isValidJson(value) ? null : 'Invalid JSON';
  }

  formatJson(): void {
    const formatted = this.tryFormatJson(this.rawJson);
    if (formatted.ok) {
      this.rawJson = formatted.value;
      this.jsonError = null;
      return;
    }

    this.jsonError = formatted.error;
  }

  // --- Save ---

  onSave(): void {
    const mode = this.editorMode();
    const key = String(this.form.get('key')!.value ?? '').trim();

    if (mode === 'json') {
      this.saveFromJson();
      return;
    }

    if (!this.isCurrentModeFormValid() || this.keyAlreadyExists() || !key) return;

    // Collect current values
    const flagType = this.flagType();
    let currentValue: unknown;

    switch (flagType) {
      case 'boolean':
        currentValue = this.form.get('booleanValue')!.value;
        break;
      case 'string':
        currentValue = this.form.get('stringValue')!.value;
        break;
      case 'number':
        currentValue = this.form.get('numberValue')!.value;
        break;
      case 'object': {
        const objStr = this.form.get('objectValue')!.value;
        try {
          currentValue = JSON.parse(objStr);
        } catch {
          currentValue = {};
        }
        break;
      }
    }

    // Build global time window if enabled
    let globalTimeWindow: TimeWindowValue<unknown> | undefined;
    if (this.globalEnvironmentTimeEnabled()) {
      const globalStartDate = this.form.get('globalStartDate')?.value;
      const globalStartTime = this.form.get('globalStartTime')?.value;
      const globalEndDate = this.form.get('globalEndDate')?.value;
      const globalEndTime = this.form.get('globalEndTime')?.value;

      const startDate = this.combineDateAndTime(globalStartDate, globalStartTime);
      const endDate = this.combineDateAndTime(globalEndDate, globalEndTime);

      if (startDate || endDate) {
        const timeWindow: Record<string, Date | undefined> = {};
        if (startDate) {
          timeWindow['startTime'] = startDate;
        }
        if (endDate) {
          timeWindow['endTime'] = endDate;
        }
        globalTimeWindow = {
          value: currentValue,
          timeWindow: timeWindow as unknown as TimeWindowValue<unknown>['timeWindow'],
        };
      }
    }

    // Build environment definitions
    const perEnvDefs: Record<string, ValueDefinition<unknown>> = {};
    for (const [envName, envDef] of Object.entries(this.perEnvironmentDefinitions())) {
      const timeWindowState = this.environmentTimeWindows()[envName.toLowerCase()];
      let timeWindow: Record<string, Date | undefined> | undefined;

      if (timeWindowState && (timeWindowState.startDate || timeWindowState.endDate)) {
        const startDate = this.combineDateAndTime(
          timeWindowState.startDate,
          timeWindowState.startTime,
        );
        const endDate = this.combineDateAndTime(timeWindowState.endDate, timeWindowState.endTime);

        if (startDate || endDate) {
          timeWindow = {};
          if (startDate) {
            timeWindow['startTime'] = startDate;
          }
          if (endDate) {
            timeWindow['endTime'] = endDate;
          }
        }
      }

      perEnvDefs[envName] = {
        value: envDef.value,
        ...(timeWindow && {
          timeWindow: timeWindow as unknown as ValueDefinition<unknown>['timeWindow'],
        }),
      };
    }

    const displayFlag: DisplayFlag = {
      key,
      type: flagType,
      state: this.form.get('state')!.value as FlagState,
      value: currentValue,
      ...(Object.keys(perEnvDefs).length > 0 && { perEnvironmentDefinitions: perEnvDefs }),
      ...(globalTimeWindow && { globalTimeWindow }),
      ...(this.metadata() &&
        Object.keys(this.metadata()!).length > 0 && { metadata: this.metadata() }),
    } as DisplayFlag;

    this.save.emit({
      key,
      flag: displayFlag,
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

  private syncToJson(): void {
    const flagType = this.flagType();
    let value: unknown = this.flagValue();

    switch (flagType) {
      case 'boolean':
        value = this.form.get('booleanValue')!.value;
        break;
      case 'string':
        value = this.form.get('stringValue')!.value;
        break;
      case 'number':
        value = this.form.get('numberValue')!.value;
        break;
      case 'object': {
        const objStr = this.form.get('objectValue')!.value;
        try {
          value = JSON.parse(objStr);
        } catch {
          value = {};
        }
        break;
      }
    }

    // For now, serialize as minimal JSON representation
    const displayFlag = {
      key: this.form.get('key')!.value,
      type: flagType,
      state: this.form.get('state')!.value,
      value,
    } as DisplayFlag;

    if (
      this.perEnvironmentDefinitions() &&
      Object.keys(this.perEnvironmentDefinitions()).length > 0
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (displayFlag as any).perEnvironmentDefinitions = this.perEnvironmentDefinitions();
    }

    if (this.globalTimeWindow()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (displayFlag as any).globalTimeWindow = this.globalTimeWindow();
    }

    if (this.metadata()) {
      displayFlag.metadata = this.metadata();
    }

    this.rawJson = JSON.stringify(displayFlag, null, 2);
    this.jsonError = null;
  }

  private applyJsonToForm(): boolean {
    try {
      const parsed = JSON.parse(this.rawJson);

      if (!parsed.key || !parsed.type || !parsed.state) {
        this.jsonError = 'Missing required fields: key, type, state';
        return false;
      }

      this.form.patchValue({
        key: parsed.key,
        flagType: parsed.type,
        state: parsed.state,
      });

      this.flagType.set(parsed.type);
      this.flagValue.set(parsed.value ?? null);
      this.perEnvironmentDefinitions.set(parsed.perEnvironmentDefinitions ?? {});
      this.globalTimeWindow.set(parsed.globalTimeWindow);
      this.metadata.set(parsed.metadata);

      // Update value form controls
      this.form.patchValue({
        booleanValue: parsed.type === 'boolean' ? parsed.value : false,
        stringValue: parsed.type === 'string' ? String(parsed.value ?? '') : '',
        numberValue: parsed.type === 'number' ? (parsed.value ?? 0) : 0,
        objectValue: parsed.type === 'object' ? JSON.stringify(parsed.value ?? {}, null, 2) : '{}',
      });

      this.jsonError = null;
      return true;
    } catch (error) {
      this.jsonError = `Invalid JSON: ${String(error)}`;
      return false;
    }
  }

  private saveFromJson(): void {
    const key = String(this.form.get('key')!.value ?? '').trim();
    if (!key || this.form.get('key')!.invalid || this.keyAlreadyExists()) return;

    if (!this.applyJsonToForm()) {
      return;
    }

    // Once parsed, save as DisplayFlag
    const flagType = this.flagType();
    let currentValue: unknown;

    switch (flagType) {
      case 'boolean':
        currentValue = this.form.get('booleanValue')!.value;
        break;
      case 'string':
        currentValue = this.form.get('stringValue')!.value;
        break;
      case 'number':
        currentValue = this.form.get('numberValue')!.value;
        break;
      case 'object':
        try {
          currentValue = JSON.parse(this.form.get('objectValue')!.value);
        } catch {
          currentValue = {};
        }
        break;
    }

    const displayFlag: DisplayFlag = {
      key,
      type: flagType,
      state: this.form.get('state')!.value as FlagState,
      value: currentValue,
      ...(Object.keys(this.perEnvironmentDefinitions()).length > 0 && {
        perEnvironmentDefinitions: this.perEnvironmentDefinitions(),
      }),
      ...(this.globalTimeWindow() && { globalTimeWindow: this.globalTimeWindow() }),
      ...(this.metadata() &&
        Object.keys(this.metadata()!).length > 0 && { metadata: this.metadata() }),
    } as DisplayFlag;

    this.save.emit({
      key,
      flag: displayFlag,
      originalKey: this.flag()?.key,
    });
  }

  private hasChanges(): boolean {
    if (!this.form) return false;
    return this.buildEditorSnapshot() !== this.initialEditorSnapshot;
  }

  private buildEditorSnapshot(): string {
    return JSON.stringify({
      key: this.form?.get('key')?.value ?? '',
      state: this.form?.get('state')?.value ?? 'ENABLED',
      flagType: this.form?.get('flagType')?.value ?? 'boolean',
      booleanValue: this.form?.get('booleanValue')?.value ?? false,
      stringValue: this.form?.get('stringValue')?.value ?? '',
      numberValue: this.form?.get('numberValue')?.value ?? 0,
      objectValue: this.form?.get('objectValue')?.value ?? '{}',
      flagValue: this.flagValue(),
      perEnvironmentDefinitions: this.perEnvironmentDefinitions(),
      globalTimeWindow: this.globalTimeWindow(),
      metadata: this.metadata(),
      editorMode: this.editorMode(),
      globalEnvironmentTimeEnabled: this.globalEnvironmentTimeEnabled(),
      environmentTimeWindows: this.environmentTimeWindows(),
      rawJson: this.rawJson.trim(),
    });
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
    try {
      JSON.parse(this.rawJson);
      return true;
    } catch {
      return false;
    }
  }

  private isCurrentModeFormValid(): boolean {
    const keyControl = this.form.get('key');
    return !!(keyControl && keyControl.valid);
  }

  private isValidJson(raw: string): boolean {
    try {
      JSON.parse(raw);
      return true;
    } catch {
      return false;
    }
  }

  private tryFormatJson(raw: string): { ok: true; value: string } | { ok: false; error: string } {
    try {
      const parsed = JSON.parse(raw);
      return { ok: true, value: JSON.stringify(parsed, null, 2) };
    } catch {
      return { ok: false, error: 'Cannot format: invalid JSON' };
    }
  }

  private getDefaultValueForType(flagType: FlagType): unknown {
    switch (flagType) {
      case 'boolean':
        return false;
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'object':
        return {};
    }
  }

  private parseTimestampDate(value: unknown): Date | null {
    if (value === null || value === undefined || !(value instanceof Date)) {
      return null;
    }
    return value;
  }

  private toTimestampString(value: unknown): string | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return value.toISOString();
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

  private serializeEnvironmentTimeWindows(): Record<string, TimeWindowFormState> {
    return this.environmentTimeWindows();
  }
}
