import { Component, input, output, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

type TargetingMode = 'none' | 'simple' | 'json';
type Operator = '==' | '!=' | 'in' | 'starts_with' | 'ends_with';

@Component({
  selector: 'app-targeting-editor',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './targeting-editor.html',
  styleUrl: './targeting-editor.scss',
})
export class TargetingEditorComponent implements OnChanges {
  readonly targeting = input<Record<string, unknown> | undefined>();
  readonly variantKeys = input.required<string[]>();
  readonly targetingChange = output<Record<string, unknown> | undefined>();

  mode: TargetingMode = 'none';

  // Simple mode fields
  property = '';
  operator: Operator = '==';
  compValue = '';
  thenVariant = '';
  elseVariant = '';

  // JSON mode
  rawJson = '';
  jsonError: string | null = null;

  ngOnChanges(): void {
    const t = this.targeting();
    if (!t || Object.keys(t).length === 0) {
      this.mode = 'none';
      this.rawJson = '';
      this.resetSimpleFields();
      return;
    }

    this.rawJson = JSON.stringify(t, null, 2);

    // Try to parse as simple rule
    if (this.parseSimpleRule(t)) {
      this.mode = 'simple';
    } else {
      this.mode = 'json';
    }
  }

  setMode(mode: TargetingMode): void {
    if (mode === this.mode) return;

    if (mode === 'none') {
      this.targetingChange.emit(undefined);
    } else if (mode === 'simple') {
      this.resetSimpleFields();
      if (this.variantKeys().length > 0) {
        this.thenVariant = this.variantKeys()[0];
        this.elseVariant = this.variantKeys().length > 1 ? this.variantKeys()[1] : this.variantKeys()[0];
      }
      this.emitSimpleRule();
    } else if (mode === 'json') {
      const current = this.targeting();
      this.rawJson = current && Object.keys(current).length > 0 ? JSON.stringify(current, null, 2) : '{}';
      this.jsonError = null;
    }
    this.mode = mode;
  }

  onSimpleFieldChange(): void {
    this.emitSimpleRule();
  }

  onJsonChange(value: string): void {
    this.rawJson = value;
    try {
      const parsed = JSON.parse(value);
      this.jsonError = null;
      this.targetingChange.emit(parsed);
    } catch {
      this.jsonError = 'Invalid JSON';
    }
  }

  insertTemplate(type: 'condition' | 'fractional'): void {
    if (type === 'condition') {
      const variants = this.variantKeys();
      const v1 = variants[0] ?? 'variant-a';
      const v2 = variants[1] ?? variants[0] ?? 'variant-b';
      this.rawJson = JSON.stringify(
        { if: [{ '==': [{ var: '' }, ''] }, v1, v2] },
        null,
        2,
      );
    } else {
      const variants = this.variantKeys();
      const buckets = variants.map((v) => [v, Math.floor(100 / variants.length)]);
      this.rawJson = JSON.stringify({ fractional: buckets }, null, 2);
    }
    this.onJsonChange(this.rawJson);
  }

  clearTargeting(): void {
    this.rawJson = '{}';
    this.onJsonChange(this.rawJson);
  }

  private resetSimpleFields(): void {
    this.property = '';
    this.operator = '==';
    this.compValue = '';
    this.thenVariant = '';
    this.elseVariant = '';
  }

  private emitSimpleRule(): void {
    if (!this.property) {
      this.targetingChange.emit(undefined);
      return;
    }

    let condition: Record<string, unknown>;
    const varRef = { var: this.property };

    if (this.operator === 'in') {
      const values = this.compValue.split(',').map((v) => v.trim()).filter(Boolean);
      condition = { in: [varRef, values] };
    } else if (this.operator === 'starts_with' || this.operator === 'ends_with') {
      condition = { [this.operator]: [varRef, this.compValue] };
    } else {
      condition = { [this.operator]: [varRef, this.compValue] };
    }

    const rule: Record<string, unknown> = {
      if: [condition, this.thenVariant || null, this.elseVariant || null],
    };

    this.targetingChange.emit(rule);
  }

  private parseSimpleRule(t: Record<string, unknown>): boolean {
    // Check if it matches: { "if": [{ op: [{ var: prop }, value] }, then, else] }
    const ifArr = t['if'];
    if (!Array.isArray(ifArr) || ifArr.length < 2) return false;

    const condition = ifArr[0] as Record<string, unknown>;
    if (!condition || typeof condition !== 'object') return false;

    const operators: Operator[] = ['==', '!=', 'in', 'starts_with', 'ends_with'];
    for (const op of operators) {
      if (op in condition) {
        const operands = condition[op];
        if (!Array.isArray(operands) || operands.length < 2) continue;

        const first = operands[0] as Record<string, unknown>;
        if (first && typeof first === 'object' && 'var' in first) {
          this.property = String(first['var']);
          this.operator = op;

          if (op === 'in' && Array.isArray(operands[1])) {
            this.compValue = (operands[1] as string[]).join(', ');
          } else {
            this.compValue = String(operands[1]);
          }

          this.thenVariant = typeof ifArr[1] === 'string' ? ifArr[1] : '';
          this.elseVariant = typeof ifArr[2] === 'string' ? ifArr[2] : '';
          return true;
        }
      }
    }

    return false;
  }
}
