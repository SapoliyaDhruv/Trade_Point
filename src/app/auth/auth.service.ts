import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap, catchError, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { apiUrl } from '../shared/utils/url';

export interface User {
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'user';
  profilePhoto?: string;
  payoutDetails?: {
    payoutMethod?: 'none' | 'bank' | 'upi';
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiId?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);
  private router = inject(Router);

  private baseUrl = apiUrl('/auth');
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USER_KEY = 'current_user';
  private readonly ROLE_KEY = 'role';

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    this.loadUserFromStorage();
  }

  // ─────────────────────────────────────────────
  // Login – fixed response handling
  // ─────────────────────────────────────────────
  login(credentials: { email: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/login`, credentials).pipe(
      tap(res => {
        if (res.token && res.role) {
          this.setToken(res.token);
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem(this.ROLE_KEY, res.role);
          }

          // We'll fetch full user data right after login via /me
          // This avoids shape mismatch
          this.fetchCurrentUser().subscribe();
        }
      }),
      map(res => ({
        token: res.token,
        role: res.role
      }))
    );
  }

  requestPasswordReset(email: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/forgot-password`, { email });
  }

  resetPassword(payload: { email: string; otp: string; newPassword: string }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/reset-password`, payload);
  }

  // ─────────────────────────────────────────────
  // Most important fix: Always send token!
  // ─────────────────────────────────────────────
  fetchCurrentUser(): Observable<User> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.token}`
    });

    return this.http.get<User>(`${this.baseUrl}/me`, { headers }).pipe(
      tap(user => {
        if (user && user.email && user.role) {
          localStorage.setItem(this.USER_KEY, JSON.stringify(user));
          this.currentUserSubject.next(user);
        }
      }),
      catchError(err => {
        console.warn('fetchCurrentUser failed:', err.status, err.message);
        if (err.status === 401 || err.status === 403) {
          console.warn("401/403 → logging out automatically");
          // this.logout(); // auto logout on unauthorized
        }
        return throwError(() => err);
      })
    );
  }

  // ─────────────────────────────────────────────
  // Helper methods
  // ─────────────────────────────────────────────
  private setToken(token: string): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.TOKEN_KEY, token);
    }
  }

  get token(): string | null {
    return isPlatformBrowser(this.platformId) ? localStorage.getItem(this.TOKEN_KEY) : null;
  }

  get currentUserSnapshot(): User | null {
    return this.currentUserSubject.value;
  }

  get role(): 'admin' | 'user' | null {
    return this.currentUserSnapshot?.role ?? null;
  }

  isAdmin(): boolean {
    return this.role === 'admin';
  }

  isLoggedIn(): boolean {
    return !!this.token && !!this.currentUserSnapshot;
  }

  logout(redirect: boolean = true): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
      localStorage.removeItem(this.ROLE_KEY);
    }
    this.currentUserSubject.next(null);

    if (redirect) {
      this.router.navigate(['/login']);
    }
  }

  private loadUserFromStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const storedUser = localStorage.getItem(this.USER_KEY);
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser) as User;
        if (user?.email && user?.role) {
          localStorage.setItem(this.ROLE_KEY, user.role);
          this.currentUserSubject.next(user);
        } else {
          this.logout(false);
        }
      } catch (e) {
        console.warn('Invalid stored user data');
        this.logout(false);
      }
    }

    // Optional: validate token on app start by calling /me
    if (this.token && !this.currentUserSnapshot) {
      this.fetchCurrentUser().subscribe({
        error: () => this.logout(false)
      });
    }
  }
}
