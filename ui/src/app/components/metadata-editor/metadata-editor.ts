import { Component, input, output, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MetadataMap } from '../../models/flag.models';
import { MetadataDto } from '../../services/flag-backend';

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
  readonly metadata = input<MetadataDto[] | undefined>(undefined);
  readonly metadataChange = output<MetadataDto[]>();
  metadataCurrent: MetadataDto[] = [];

  ngOnChanges(): void {
    this.metadataCurrent = this.metadata ? JSON.parse(JSON.stringify(this.metadata)) : undefined;
  }

  addRow(): void {
    if (this.hasUntouchedDraftRow()) {
      return;
    }

    this.metadataCurrent = [
      ...this.metadataCurrent,
      { key: '', booleanValue: true } as MetadataDto,
    ];
  }

  removeRow(index: number): void {
    this.metadataCurrent = this.metadataCurrent.filter((_, rowIndex) => rowIndex !== index);
    this.emitChange();
  }

  onKeyChange(index: number, key: string): void {
    this.metadataCurrent = this.metadataCurrent.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return { ...row, key };
    });
    this.emitChange();
  }

  onTypeChange(index: number, type: MetadataValueType): void {
    this.metadataCurrent = this.metadataCurrent.map((row, rowIndex) => {
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
    this.metadataCurrent = this.metadataCurrent.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return { ...row, value };
    });
    this.emitChange();
  }

  onNumberChange(index: number, value: string): void {
    const parsed = Number(value);
    this.metadataCurrent = this.metadataCurrent.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return {
        ...row,
        value: Number.isFinite(parsed) ? parsed : 0,
      };
    });
    this.emitChange();
  }

  onBooleanChange(index: number, value: string): void {
    this.metadataCurrent = this.metadataCurrent.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return {
        ...row,
        value: value === 'true',
      };
    });
    this.emitChange();
  }

  private emitChange(): void {
    this.metadataChange.emit(this.metadataCurrent);
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

  private hasUntouchedDraftRow(): boolean {
    return this.metadataCurrent.some((row) => {
      if (row.key.trim().length > 0) {
        return false;
      }

      return true;
    });
  }
}
