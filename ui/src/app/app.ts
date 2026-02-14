import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
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

const THEME_STORAGE_KEY = 'flagd-ui-theme';
type AppTheme = 'light' | 'dark';
type ThemeMode = 'auto' | 'dark' | 'light';

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
export class App implements OnDestroy {
  private readonly store = inject(FlagStore);
  private readonly navigationCollapseWidth = 1280;
  readonly globalLoading = inject(GlobalLoadingService);
  readonly themeMode = signal<ThemeMode>(this.loadInitialThemeMode());
  readonly prefersDark = signal(this.systemPrefersDark());
  readonly theme = computed<AppTheme>(() => {
    const mode = this.themeMode();
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    return this.prefersDark() ? 'dark' : 'light';
  });
  dragOver = false;
  isCompactLayout = signal(
    typeof window !== 'undefined' && window.innerWidth <= this.navigationCollapseWidth,
  );
  navOpen = signal(!this.isCompactLayout());
  private readonly mediaQuery =
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly onMediaThemeChange = (event: MediaQueryListEvent): void => {
    this.prefersDark.set(event.matches);
    if (this.themeMode() === 'auto') {
      this.applyTheme(this.theme());
    }
  };

  constructor() {
    this.applyTheme(this.theme());
    this.mediaQuery?.addEventListener('change', this.onMediaThemeChange);
  }

  ngOnDestroy(): void {
    this.mediaQuery?.removeEventListener('change', this.onMediaThemeChange);
  }

  themeModeIcon(): string {
    const mode = this.themeMode();
    if (mode === 'dark') return 'dark_mode';
    if (mode === 'light') return 'light_mode';
    return 'brightness_auto';
  }

  themeModeLabel(): string {
    const mode = this.themeMode();
    if (mode === 'dark') return 'Theme: Dark';
    if (mode === 'light') return 'Theme: Light';
    return 'Theme: Auto';
  }

  cycleThemeMode(): void {
    const current = this.themeMode();
    const next: ThemeMode = current === 'auto' ? 'dark' : current === 'dark' ? 'light' : 'auto';
    this.themeMode.set(next);
    this.applyTheme(this.theme());
    this.persistThemeMode(next);
  }

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

  private loadInitialThemeMode(): ThemeMode {
    if (typeof window === 'undefined') return 'auto';

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'auto' || storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }

    return 'auto';
  }

  private systemPrefersDark(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private applyTheme(theme: AppTheme): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }

  private persistThemeMode(theme: ThemeMode): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}
