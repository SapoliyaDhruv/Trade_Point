import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'tp_theme_mode';
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);

  private modeSubject = new BehaviorSubject<ThemeMode>('light');
  mode$ = this.modeSubject.asObservable();

  constructor() {
    this.initTheme();
  }

  get mode(): ThemeMode {
    return this.modeSubject.value;
  }

  toggleTheme() {
    this.setTheme(this.mode === 'light' ? 'dark' : 'light');
  }

  setTheme(mode: ThemeMode) {
    this.modeSubject.next(mode);
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem(this.storageKey, mode);
  }

  private initTheme() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const saved = localStorage.getItem(this.storageKey) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') {
      this.setTheme(saved);
      return;
    }

    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    this.setTheme(prefersDark ? 'dark' : 'light');
  }
}
