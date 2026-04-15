import { Routes } from '@angular/router';
import { WelcomeComponent } from './components/welcome/welcome';
import { FlagsFileDetailComponent } from './components/flags-file-detail/flags-file-detail';
import { FlagsFileEditPageComponent } from './components/flags-file-edit-page/flags-file-edit-page';
import { FlagsFileSettingsPageComponent } from './components/flags-file-settings-page/flags-file-settings-page';

export const routes: Routes = [
  { path: '', component: WelcomeComponent },
  { path: ':uri/:collectionId', component: FlagsFileDetailComponent },
  { path: ':uri/:collectionId/settings', component: FlagsFileSettingsPageComponent },
  { path: ':uri/:collectionId/edit/new', component: FlagsFileEditPageComponent },
  { path: ':uri/:collectionId/edit/:flagKey', component: FlagsFileEditPageComponent },
];
