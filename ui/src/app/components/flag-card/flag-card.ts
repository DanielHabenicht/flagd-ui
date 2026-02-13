import { Component, input, output } from '@angular/core';
import { FlagEntry, inferFlagType } from '../../models/flag.models';

@Component({
  selector: 'app-flag-card',
  standalone: true,
  templateUrl: './flag-card.html',
  styleUrl: './flag-card.css',
})
export class FlagCardComponent {
  readonly flag = input.required<FlagEntry>();
  readonly edit = output<void>();
  readonly delete = output<void>();

  get flagType(): string {
    return inferFlagType(this.flag().variants);
  }

  get variantCount(): number {
    return Object.keys(this.flag().variants).length;
  }

  get variantNames(): string[] {
    return Object.keys(this.flag().variants);
  }

  get hasTargeting(): boolean {
    const t = this.flag().targeting;
    return !!t && Object.keys(t).length > 0;
  }

  onEdit(): void {
    this.edit.emit();
  }

  onDelete(): void {
    if (confirm(`Delete flag "${this.flag().key}"?`)) {
      this.delete.emit();
    }
  }
}
