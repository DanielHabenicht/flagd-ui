import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { NewFlagsFileFormComponent } from '../new-flags-file-form/new-flags-file-form';

@Component({
  selector: 'app-new-flags-file-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, NewFlagsFileFormComponent],
  templateUrl: './new-flags-file-dialog.html',
  styleUrl: './new-flags-file-dialog.scss',
})
export class NewFlagsFileDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<NewFlagsFileDialogComponent>);

  onFormSubmitted(): void {
    this.dialogRef.close();
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
