import { Routes } from '@angular/router';
import { WelcomeComponent } from './components/welcome/welcome';
import { ProjectDetailComponent } from './components/project-detail/project-detail';

export const routes: Routes = [
  { path: '', component: WelcomeComponent },
  { path: 'projects/local/:name', component: ProjectDetailComponent },
  { path: 'projects/remote/:backendId/:name', component: ProjectDetailComponent },
];
