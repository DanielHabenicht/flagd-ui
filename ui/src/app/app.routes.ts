import { Routes } from '@angular/router';
import { WelcomeComponent } from './components/welcome/welcome';
import { FlagsFileDetailComponent } from './components/flags-file-detail/flags-file-detail';
import { FlagsFileEditPageComponent } from './components/flags-file-edit-page/flags-file-edit-page';
import { FlagsFileSettingsPageComponent } from './components/flags-file-settings-page/flags-file-settings-page';

export const routes: Routes = [
  { path: '', component: WelcomeComponent },
  { path: ':backendType/:uri/:fileName', component: FlagsFileDetailComponent },
  { path: ':backendType/:uri/:fileName/settings', component: FlagsFileSettingsPageComponent },
  { path: ':backendType/:uri/:fileName/edit/new', component: FlagsFileEditPageComponent },
  { path: ':backendType/:uri/:fileName/edit/:flagKey', component: FlagsFileEditPageComponent },
];
