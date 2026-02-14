import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ProjectListComponent } from './components/project-list/project-list';
import { FlagStore } from './services/flag-store';
import { FlagFileContent } from './models/flag.models';
import { GlobalLoadingService } from './services/global-loading.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    ProjectListComponent,
    MatSidenavModule,
    MatToolbarModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly store = inject(FlagStore);
  private readonly navigationCollapseWidth = 1280;
  readonly globalLoading = inject(GlobalLoadingService);
  dragOver = false;
  isCompactLayout = signal(
    typeof window !== 'undefined' && window.innerWidth <= this.navigationCollapseWidth,
  );
  navOpen = signal(!this.isCompactLayout());

  @HostListener('window:resize')
  onWindowResize(): void {
    const compact = window.innerWidth <= this.navigationCollapseWidth;
    if (compact === this.isCompactLayout()) return;

    this.isCompactLayout.set(compact);
    this.navOpen.set(!compact);
  }

  toggleNavigation(): void {
    if (!this.isCompactLayout()) return;
    this.navOpen.set(!this.navOpen());
  }

  onNavigationStateChange(opened: boolean): void {
    if (!this.isCompactLayout()) return;
    this.navOpen.set(opened);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;

    const files = event.dataTransfer?.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.endsWith('.json')) continue;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const content = JSON.parse(reader.result as string) as FlagFileContent;
          if (!content.flags || typeof content.flags !== 'object') return;
          let name = file.name.replace(/\.flagd\.json$/, '').replace(/\.json$/, '');
          if (!name) name = 'imported';
          this.store.importLocalProject(name, content);
        } catch {
          console.error(`Failed to parse ${file.name}`);
        }
      };
      reader.readAsText(file);
    }
  }
}
