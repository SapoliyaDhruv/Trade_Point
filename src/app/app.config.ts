import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations'; // ← Changed to Noop
import { provideNativeDateAdapter } from '@angular/material/core';

import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { jwtInterceptor } from './interceptors/jwt.interceptor';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideNoopAnimations(),                // ← FIXED: Use this instead of provideAnimations()
    provideNativeDateAdapter(),
    provideHttpClient(
      withFetch(),
      withInterceptors([jwtInterceptor])
    ),
  ]
};