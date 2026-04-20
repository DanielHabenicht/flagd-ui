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
import { GlobalLoadingService } from './services/global-loading.service';
import { SetThemeMode, ThemeMode } from './state/ui-preferences.actions';
import { UiPreferencesState } from './state/ui-preferences.state';
import { FlagStoreState } from './state/flag-store.state';
import { FLAG_BACKEND } from './services/flag-backend';
import { ENVIRONMENT } from '../environments';

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
  private readonly backend = inject(FLAG_BACKEND);
  private readonly navigationCollapseWidth = 1280;
  readonly globalLoading = inject(GlobalLoadingService);
  readonly themeMode = this.ngxsStore.selectSignal(UiPreferencesState.themeMode);

  // FlagStore selectors
  readonly selectedCollection = this.ngxsStore.selectSignal(FlagStoreState.selectedCollection);
  // readonly backendsMap = this.ngxsStore.selectSignal(FlagFileStore.backendsMap);
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
  readonly isRootRoute = computed(() => {
    const path = this.currentUrl().split('?')[0];
    return path === '/' || path === '';
  });
  readonly displayedCollectionName = computed(() => this.selectedCollection()?.name || '');
  readonly showFlagsContextHeader = computed(() => !this.isRootRoute());
  readonly showPageHeader = computed(() => !this.isRootRoute());
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
    return 'Breadcrumb';
    // const backendType = this.currentFlagsBackendType();
    // const backendUri = this.currentFlagsBackendUri();
    // if (!backendType || !backendUri) return null;

    // const backend = this.backendsMap()?.[backendType]?.[backendUri];
    // if (backendType === 'local') {
    //   return (
    //     backend?.label ?? (backendUri === 'disk' ? 'Local Files · Disk' : 'Local Files · Browser')
    //   );
    // }

    // return backend?.label ?? backendUri;
  });
  readonly sourceBreadcrumbRoute = computed(() => ['/']);
  readonly flagsFileDetailRoute = computed(() => {
    return null;
    // const backendType = this.currentFlagsBackendType();
    // const backendUri = this.currentFlagsBackendUri();
    // const fileName = this.currentCollection();

    // if (backendType && backendUri && fileName) {
    //   return ['/', backendType, backendUri, fileName];
    // }

    // return null;
  });
  navOpen = signal(!this.isCompactLayout());

  readonly canExportDatabase =
    ENVIRONMENT === 'development' && typeof this.backend.exportDatabase === 'function';
  readonly showPlaygroundDrawer = computed(() => true);

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

  @HostListener('window:beforeunload', ['$event'])
  async beforeUnloadHandler(event: any) {
    await this.backend.saveState?.();
    // debugger;
  }

  // @HostListener('mouseout')
  // async onMouseLeave() {
  //   await this.backend.saveState?.();
  //   // debugger;
  // }

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
          if (!file.name) throw new Error('File must have a name');
          // this.ngxsStore.dispatch(
          //   new AddFile('local', 'browser', file.name, reader.result as string),
          // );
        } catch {
          console.error(`Failed to parse ${file.name}`);
        }
      };
      reader.readAsText(file);
    }
  }

  async downloadDatabase(): Promise<void> {
    if (!this.backend.exportDatabase) return;
    const bytes = await this.backend.exportDatabase();
    if (!bytes) return;
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flagd-ui.db';
    a.click();
    URL.revokeObjectURL(url);
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
