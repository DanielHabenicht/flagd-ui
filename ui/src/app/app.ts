import {
  Component,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { Store } from '@ngxs/store';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { filter, Subscription } from 'rxjs';
import { FlagsFileListComponent } from './components/flags-file-list/flags-file-list';
import { FlagsFileDetailComponent } from './components/flags-file-detail/flags-file-detail';
import { FlagsFileEditPageComponent } from './components/flags-file-edit-page/flags-file-edit-page';
import { FlagsFileSettingsPageComponent } from './components/flags-file-settings-page/flags-file-settings-page';
import { PlaygroundDrawerComponent } from './components/playground-drawer/playground-drawer';
import { FlagFileContent } from './models/flag.models';
import { GlobalLoadingService } from './services/global-loading.service';
import { BackendRegistry } from './services/backend-registry';
import { SetThemeMode, ThemeMode } from './state/ui-preferences.actions';
import { UiPreferencesState } from './state/ui-preferences.state';
import { FlagStoreState } from './state/current-flag-store.state';
import { ImportLocalFlagsFile } from './state/current-flag-store.actions';

type AppTheme = 'light' | 'dark';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    FlagsFileListComponent,
    PlaygroundDrawerComponent,
    MatSidenavModule,
    MatToolbarModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  private readonly ngxsStore = inject(Store);
  private readonly router = inject(Router);
  private readonly backendRegistry = inject(BackendRegistry);
  private readonly navigationCollapseWidth = 1280;
  readonly globalLoading = inject(GlobalLoadingService);
  readonly themeMode = this.ngxsStore.selectSignal(UiPreferencesState.themeMode);

  // FlagStore selectors
  readonly currentFlagsFileName = this.ngxsStore.selectSignal(FlagStoreState.fileName);
  readonly prefersDark = signal(this.systemPrefersDark());
  readonly theme = computed<AppTheme>(() => {
    const mode = this.themeMode();
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    return this.prefersDark() ? 'dark' : 'light';
  });
  dragOver = false;
  readonly currentUrl = signal(this.router.url);
  readonly activeRouteComponent = signal<unknown | null>(null);
  isCompactLayout = signal(
    typeof window !== 'undefined' && window.innerWidth <= this.navigationCollapseWidth,
  );
  readonly showFlagsContextHeader = computed(
    () => this.currentUrl().startsWith('/flags-files/') && !!this.currentFlagsFileName(),
  );
  readonly showPageHeader = computed(() => this.isCompactLayout() || this.showFlagsContextHeader());
  readonly isOverviewComponentActive = computed(
    () => this.activeRouteComponent() instanceof FlagsFileDetailComponent,
  );
  readonly isEditComponentActive = computed(
    () => this.activeRouteComponent() instanceof FlagsFileEditPageComponent,
  );
  readonly isSettingsComponentActive = computed(
    () => this.activeRouteComponent() instanceof FlagsFileSettingsPageComponent,
  );
  readonly editedFlagBreadcrumb = computed(() => {
    const component = this.activeRouteComponent();
    if (!(component instanceof FlagsFileEditPageComponent)) {
      return null;
    }

    const selectedFlagKey = component.selectedFlagKey();
    if (selectedFlagKey) {
      return selectedFlagKey;
    }

    const routeFlagKey = this.getFlagKeyFromUrl(this.currentUrl());
    if (!routeFlagKey || routeFlagKey === 'new') {
      return 'New Flag';
    }

    return decodeURIComponent(routeFlagKey);
  });
  readonly detailBreadcrumb = computed(() => {
    if (this.isSettingsComponentActive()) {
      return 'Settings';
    }

    if (this.isEditComponentActive()) {
      return this.editedFlagBreadcrumb();
    }

    return null;
  });
  readonly sourceBreadcrumb = computed(() => {
    const flagsFile = this.currentFlagsFile();
    if (!flagsFile) return null;

    if (flagsFile.source === 'local') {
      return flagsFile.localOrigin === 'disk' ? 'Local Files · Disk' : 'Local Files · Browser';
    }

    const backend = this.backendRegistry
      .getBackends()
      .find((entry) => entry.id === flagsFile.backendId);
    return backend?.label ?? 'Unknown Backend';
  });
  readonly sourceBreadcrumbRoute = computed(() => ['/']);
  readonly flagsFileDetailRoute = computed(() => {
    const path = this.currentUrl().split('?')[0];

    const localMatch = path.match(/^\/flags-files\/local\/([^/]+)/);
    if (localMatch) {
      return ['/flags-files', 'local', decodeURIComponent(localMatch[1])];
    }

    const remoteMatch = path.match(/^\/flags-files\/remote\/([^/]+)\/([^/]+)/);
    if (remoteMatch) {
      return [
        '/flags-files',
        'remote',
        decodeURIComponent(remoteMatch[1]),
        decodeURIComponent(remoteMatch[2]),
      ];
    }

    return null;
  });
  navOpen = signal(!this.isCompactLayout());

  readonly showPlaygroundDrawer = computed(() => true);

  readonly playgroundDrawerFlags = computed(() => {
    const component = this.activeRouteComponent();
    if (
      component instanceof FlagsFileDetailComponent ||
      component instanceof FlagsFileEditPageComponent ||
      component instanceof FlagsFileSettingsPageComponent
    ) {
      return component.flagEntries();
    }
    return [];
  });

  readonly playgroundDrawerEvaluators = computed(() => {
    const component = this.activeRouteComponent();
    if (
      component instanceof FlagsFileDetailComponent ||
      component instanceof FlagsFileEditPageComponent ||
      component instanceof FlagsFileSettingsPageComponent
    ) {
      return component.currentEvaluators();
    }
    return undefined;
  });

  readonly playgroundDrawerSelectedFlagKey = computed(() => {
    const component = this.activeRouteComponent();
    if (
      component instanceof FlagsFileDetailComponent ||
      component instanceof FlagsFileEditPageComponent
    ) {
      return component.selectedFlagKey();
    }
    return null;
  });

  private readonly routerEventsSub: Subscription;
  private readonly mediaQuery =
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly onMediaThemeChange = (event: MediaQueryListEvent): void => {
    this.prefersDark.set(event.matches);
    if (this.themeMode() === 'auto') {
      this.applyTheme(this.theme());
    }
  };
  private readonly syncTheme = effect(() => {
    this.applyTheme(this.theme());
  });

  constructor() {
    this.mediaQuery?.addEventListener('change', this.onMediaThemeChange);
    this.routerEventsSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
      });
  }

  ngOnDestroy(): void {
    this.mediaQuery?.removeEventListener('change', this.onMediaThemeChange);
    this.routerEventsSub.unsubscribe();
  }

  onRouteActivate(component: unknown): void {
    this.activeRouteComponent.set(component);
  }

  onRouteDeactivate(): void {
    this.activeRouteComponent.set(null);
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
    this.ngxsStore.dispatch(new SetThemeMode(next));
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

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.json')) continue;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const content = JSON.parse(reader.result as string) as FlagFileContent;
          if (!content.flags || typeof content.flags !== 'object') return;
          let name = file.name.replace(/\.flagd\.json$/, '').replace(/\.json$/, '');
          if (!name) name = 'imported';
          this.ngxsStore.dispatch(new ImportLocalFlagsFile(name, content, 'browser'));
        } catch {
          console.error(`Failed to parse ${file.name}`);
        }
      };
      reader.readAsText(file);
    }
  }

  openSettingsPage(): void {
    this.getActiveDetailComponent()?.openSettingsPage();
  }

  downloadFlagsFile(): void {
    this.getActiveDetailComponent()?.downloadFlagsFile();
  }

  openNewFlagEditor(): void {
    this.getActiveDetailComponent()?.openNewFlagEditor();
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

  private getActiveDetailComponent(): FlagsFileDetailComponent | null {
    const component = this.activeRouteComponent();
    return component instanceof FlagsFileDetailComponent ? component : null;
  }

  private getFlagKeyFromUrl(url: string): string | null {
    const path = url.split('?')[0];
    const match = path.match(/\/edit\/([^/]+)$/);
    return match?.[1] ?? null;
  }
}
