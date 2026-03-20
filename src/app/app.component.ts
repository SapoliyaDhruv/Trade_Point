import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './shared/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Trade_Point';
  themeMode: 'light' | 'dark' = 'light';

  constructor(private themeService: ThemeService) {
    this.themeService.mode$.subscribe(mode => {
      this.themeMode = mode;
    });
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }
}
