import { Component, input, output, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MetadataMap } from '../../models/flag.models';

export type MetadataValue = string | number | boolean;
type MetadataValueType = 'string' | 'number' | 'boolean';

interface MetadataRow {
  key: string;
  type: MetadataValueType;
  value: MetadataValue;
}

@Component({
  selector: 'app-metadata-editor',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './metadata-editor.html',
  styleUrl: './metadata-editor.scss',
})
export class MetadataEditorComponent implements OnChanges {
  readonly metadata = input<MetadataMap | undefined>(undefined);
  readonly metadataChange = output<MetadataMap | undefined>();

  rows: MetadataRow[] = [];

  ngOnChanges(): void {
    const current = this.metadata();
    if (!current || Object.keys(current).length === 0) {
      this.rows = [];
      return;
    }

    this.rows = Object.entries(current).map(([key, value]) => {
      const inferredType = this.inferType(value);
      return {
        key,
        type: inferredType,
        value: this.normalizeValue(value, inferredType),
      };
    });
  }

  addRow(): void {
    this.rows = [...this.rows, { key: '', type: 'string', value: '' }];
    this.emitChange();
  }

  removeRow(index: number): void {
    this.rows = this.rows.filter((_, rowIndex) => rowIndex !== index);
    this.emitChange();
  }

  onKeyChange(index: number, key: string): void {
    this.rows = this.rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return { ...row, key };
    });
    this.emitChange();
  }

  onTypeChange(index: number, type: MetadataValueType): void {
    this.rows = this.rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return {
        ...row,
        type,
        value: this.defaultValueForType(type),
      };
    });
    this.emitChange();
  }

  onStringChange(index: number, value: string): void {
    this.rows = this.rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return { ...row, value };
    });
    this.emitChange();
  }

  onNumberChange(index: number, value: string): void {
    const parsed = Number(value);
    this.rows = this.rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return {
        ...row,
        value: Number.isFinite(parsed) ? parsed : 0,
      };
    });
    this.emitChange();
  }

  onBooleanChange(index: number, value: string): void {
    this.rows = this.rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return {
        ...row,
        value: value === 'true',
      };
    });
    this.emitChange();
  }

  private emitChange(): void {
    const next: MetadataMap = {};

    for (const row of this.rows) {
      const key = row.key.trim();
      if (!key) continue;
      next[key] = this.normalizeValue(row.value, row.type);
    }

    this.metadataChange.emit(Object.keys(next).length > 0 ? next : undefined);
  }

  private inferType(value: unknown): MetadataValueType {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  private defaultValueForType(type: MetadataValueType): MetadataValue {
    if (type === 'number') return 0;
    if (type === 'boolean') return false;
    return '';
  }

  private normalizeValue(value: unknown, type: MetadataValueType): MetadataValue {
    if (type === 'number') {
      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    }

    if (type === 'boolean') {
      return value === true;
    }

    if (typeof value === 'string') return value;
    return value === null || value === undefined ? '' : String(value);
  }
}
