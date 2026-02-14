import { Component, input, output, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FlagType } from '../../models/flag.models';

export interface VariantRow {
  name: string;
  value: unknown;
}

@Component({
  selector: 'app-variants-editor',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './variants-editor.html',
  styleUrl: './variants-editor.scss',
})
export class VariantsEditorComponent implements OnChanges {
  readonly flagType = input.required<FlagType>();
  readonly variants = input.required<VariantRow[]>();
  readonly variantsChange = output<VariantRow[]>();

  rows: VariantRow[] = [];

  ngOnChanges(): void {
    this.rows = this.variants().map((v) => ({ ...v }));
  }

  addVariant(): void {
    const defaultValue = this.getDefaultValue();
    this.rows = [...this.rows, { name: '', value: defaultValue }];
    this.emitChange();
  }

  removeVariant(index: number): void {
    this.rows = this.rows.filter((_, i) => i !== index);
    this.emitChange();
  }

  onNameChange(index: number, name: string): void {
    this.rows = this.rows.map((r, i) => (i === index ? { ...r, name } : r));
    this.emitChange();
  }

  onBooleanChange(index: number, value: string): void {
    this.rows = this.rows.map((r, i) => (i === index ? { ...r, value: value === 'true' } : r));
    this.emitChange();
  }

  onStringChange(index: number, value: string): void {
    this.rows = this.rows.map((r, i) => (i === index ? { ...r, value } : r));
    this.emitChange();
  }

  onNumberChange(index: number, value: string): void {
    const num = parseFloat(value);
    this.rows = this.rows.map((r, i) => (i === index ? { ...r, value: isNaN(num) ? 0 : num } : r));
    this.emitChange();
  }

  onObjectChange(index: number, value: string): void {
    try {
      const parsed = JSON.parse(value);
      this.rows = this.rows.map((r, i) => (i === index ? { ...r, value: parsed } : r));
      this.emitChange();
    } catch {
      // Keep old value if JSON is invalid; user is still typing
    }
  }

  getObjectString(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  isValidJson(value: string): boolean {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  private getDefaultValue(): unknown {
    switch (this.flagType()) {
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

  private emitChange(): void {
    this.variantsChange.emit([...this.rows]);
  }
}
