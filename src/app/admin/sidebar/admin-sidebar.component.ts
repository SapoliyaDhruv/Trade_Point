import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../auth/auth.service';
import { Subscription } from 'rxjs';
import { assetUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-sidebar.component.html',
  styleUrls: ['./admin-sidebar.component.css']
})
export class AdminSidebarComponent implements OnInit, OnDestroy {
  adminName = 'Admin';
  adminRole = 'Administrator';
  profileImageUrl: string = 'assets/img/admin.jpg';

  isCategoryOpen = false;
  isProductOpen = false;
  isCollapsed = false;

  private readonly collapseKey = 'tp_admin_sidebar_collapsed';

  private userSub!: Subscription;

  constructor(
    private router: Router,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.isCollapsed = this.getStoredCollapse();
    this.applyCollapsedClass();

    this.userSub = this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.adminName = user.firstName || 'Admin';
        this.adminRole = user.role === 'admin' ? 'Administrator' : user.role;

        if (user.profilePhoto) {
          const cleanPath = user.profilePhoto.replace(/\\/g, '/');
          this.profileImageUrl = assetUrl(cleanPath);
        } else {
          this.profileImageUrl = 'assets/img/admin.jpg';
        }
      }
    });

    // Auto-expand submenus based on current URL on first load only
    const currentUrl = this.router.url;
    if (currentUrl.includes('/admin/category')) {
      this.isCategoryOpen = true;
    }
    if (currentUrl.includes('/admin/products')) {
      this.isProductOpen = true;
    }
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
    this.persistCollapse();
    this.applyCollapsedClass();
  }

  toggleCategory(): void {
    this.isCategoryOpen = !this.isCategoryOpen;
  }

  toggleProduct(): void {
    this.isProductOpen = !this.isProductOpen;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
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
    document.body.classList.toggle('admin-sidebar-collapsed', this.isCollapsed);
  }
}
