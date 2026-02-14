import { Routes } from '@angular/router';
import { WelcomeComponent } from './components/welcome/welcome';
import { FlagsFileDetailComponent } from './components/flags-file-detail/flags-file-detail';
import { FlagsFileEditPageComponent } from './components/flags-file-edit-page/flags-file-edit-page';
import { FlagsFileSettingsPageComponent } from './components/flags-file-settings-page/flags-file-settings-page';

export const routes: Routes = [
  { path: '', component: WelcomeComponent },
  { path: 'flags-files/local/:name', component: FlagsFileDetailComponent },
  { path: 'flags-files/local/:name/settings', component: FlagsFileSettingsPageComponent },
  { path: 'flags-files/local/:name/edit/new', component: FlagsFileEditPageComponent },
  { path: 'flags-files/local/:name/edit/:flagKey', component: FlagsFileEditPageComponent },
  { path: 'flags-files/remote/:backendId/:name', component: FlagsFileDetailComponent },
  {
    path: 'flags-files/remote/:backendId/:name/settings',
    component: FlagsFileSettingsPageComponent,
  },
  {
    path: 'flags-files/remote/:backendId/:name/edit/new',
    component: FlagsFileEditPageComponent,
  },
  {
    path: 'flags-files/remote/:backendId/:name/edit/:flagKey',
    component: FlagsFileEditPageComponent,
  },
];
