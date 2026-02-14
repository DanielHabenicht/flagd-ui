import { Routes } from '@angular/router';
import { WelcomeComponent } from './components/welcome/welcome';
import { FlagsFileDetailComponent } from './components/flags-file-detail/flags-file-detail';

export const routes: Routes = [
  { path: '', component: WelcomeComponent },
  { path: 'flags-files/local/:name', component: FlagsFileDetailComponent },
  { path: 'flags-files/remote/:backendId/:name', component: FlagsFileDetailComponent },
];
