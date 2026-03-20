// src/app/layouts/admin-layout/admin-layout.component.ts
import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AdminSidebarComponent } from '../../admin/sidebar/admin-sidebar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, AdminSidebarComponent],
  template: `
    <div class="admin-layout">
      <header class="layout-topbar">
        <button class="menu-btn" type="button" (click)="toggleMobileSidebar()" aria-label="Toggle menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="topbar-title">Admin Panel</div>
      </header>

      <div class="sidebar-overlay" (click)="closeMobileSidebar()"></div>
      <app-admin-sidebar></app-admin-sidebar>

      <main class="admin-main">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .admin-layout {
      min-height: 100vh;
      background: var(--ad-bg);
    }
    .admin-main {
      overflow-y: auto;
      min-height: 100vh;
      background: var(--ad-bg);
    }

    .layout-topbar {
      display: none;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--ad-border);
      background: var(--ad-card);
      position: sticky;
      top: 0;
      z-index: 900;
    }

    .menu-btn {
      width: 38px;
      height: 36px;
      border-radius: 10px;
      border: 1px solid var(--ad-border);
      background: var(--ad-card-alt);
      display: inline-flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
      padding: 0 10px;
      cursor: pointer;
    }

    .menu-btn span {
      display: block;
      height: 2px;
      background: var(--ad-text);
      border-radius: 999px;
    }

    .topbar-title {
      font-weight: 800;
      letter-spacing: 0.02em;
      color: var(--ad-text);
    }

    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(8, 12, 20, 0.5);
      backdrop-filter: blur(2px);
      z-index: 800;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }

    :host-context(.admin-sidebar-open) .sidebar-overlay {
      opacity: 1;
      pointer-events: auto;
    }

    @media (max-width: 992px) {
      .layout-topbar {
        display: flex;
      }

      .sidebar-overlay {
        display: block;
      }
    }
  `]
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  private mobileSidebarOpen = false;

  ngOnInit(): void {
    if (typeof document !== 'undefined') {
      document.body.classList.add('admin-layout-active');
    }
  }

  toggleMobileSidebar(): void {
    this.setMobileSidebar(!this.mobileSidebarOpen);
  }

  closeMobileSidebar(): void {
    this.setMobileSidebar(false);
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('admin-layout-active');
      document.body.classList.remove('admin-sidebar-collapsed');
      document.body.classList.remove('admin-sidebar-open');
    }
  }

  private setMobileSidebar(open: boolean): void {
    this.mobileSidebarOpen = open;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('admin-sidebar-open', open);
    }
  }
}
