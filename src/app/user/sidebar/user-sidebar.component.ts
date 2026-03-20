import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../auth/auth.service';
import { Subscription } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { apiUrl, assetUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-user-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './user-sidebar.component.html',
  styleUrls: ['./user-sidebar.component.css']
})
export class UserSidebarComponent implements OnInit, OnDestroy {

  userName = 'User';
  profileImageUrl = 'trade-point-logo.png';
  unreadNotifications = 0;
  isCollapsed = false;

  private readonly collapseKey = 'tp_user_sidebar_collapsed';

  private userSub!: Subscription;
  private unreadTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private router: Router,
    public authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.isCollapsed = this.getStoredCollapse();
    this.applyCollapsedClass();

    this.userSub = this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.userName = user.firstName || 'User';

        if (user.profilePhoto) {
          const cleanPath = user.profilePhoto.replace(/\\/g, '/');
          this.profileImageUrl = assetUrl(cleanPath);
        } else {
          this.profileImageUrl = 'trade-point-logo.png';
        }
      } else {
        this.userName = 'Guest';
        this.profileImageUrl = 'trade-point-logo.png';
      }
    });

    this.loadUnreadNotifications();
    this.unreadTimer = setInterval(() => this.loadUnreadNotifications(), 30000);
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
    this.persistCollapse();
    this.applyCollapsedClass();
  }

  logout(): void {
    this.authService.logout();
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    if (this.unreadTimer) {
      clearInterval(this.unreadTimer);
    }
  }

  private getStoredCollapse(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(this.collapseKey) === '1';
  }

  private persistCollapse(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.collapseKey, this.isCollapsed ? '1' : '0');
  }

  private applyCollapsedClass(): void {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('user-sidebar-collapsed', this.isCollapsed);
  }

  private loadUnreadNotifications(): void {
    this.http.get<{ count: number }>(apiUrl('/users/notifications/unread-count')).subscribe({
      next: (res) => {
        this.unreadNotifications = Number(res?.count || 0);
      },
      error: () => {
        this.unreadNotifications = 0;
      }
    });
  }
}
