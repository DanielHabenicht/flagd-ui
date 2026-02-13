import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ProjectListComponent } from './components/project-list/project-list';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ProjectListComponent, MatSidenavModule, MatToolbarModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
