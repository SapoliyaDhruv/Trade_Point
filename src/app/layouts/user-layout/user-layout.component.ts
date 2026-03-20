// src/app/layouts/user-layout/user-layout.component.ts
import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UserSidebarComponent } from '../../user/sidebar/user-sidebar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, UserSidebarComponent],
  template: `
    <div class="user-layout">
      <header class="layout-topbar">
        <button class="menu-btn" type="button" (click)="toggleMobileSidebar()" aria-label="Toggle menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="topbar-title">Trade Point</div>
      </header>

      <div class="sidebar-overlay" (click)="closeMobileSidebar()"></div>
      <app-user-sidebar></app-user-sidebar>

      <main>
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .user-layout {
      min-height: 100vh;
      background: var(--tp-bg);
    }
    main {
      width: 100%;
      overflow-x: hidden;
    }

    .layout-topbar {
      display: none;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--tp-border);
      background: var(--tp-surface);
      position: sticky;
      top: 0;
      z-index: 900;
    }

    .menu-btn {
      width: 38px;
      height: 36px;
      border-radius: 10px;
      border: 1px solid var(--tp-border);
      background: var(--tp-card);
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
      background: var(--tp-text);
      border-radius: 999px;
    }

    .topbar-title {
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(2px);
      z-index: 800;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }

    :host-context(.user-sidebar-open) .sidebar-overlay {
      opacity: 1;
      pointer-events: auto;
    }

    @media (max-width: 900px) {
      .layout-topbar {
        display: flex;
      }

      .sidebar-overlay {
        display: block;
      }
    }
  `]
})
export class UserLayoutComponent implements OnInit, OnDestroy {
  private mobileSidebarOpen = false;

  ngOnInit(): void {
    if (typeof document !== 'undefined') {
      document.body.classList.add('user-layout-active');
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
      document.body.classList.remove('user-layout-active');
      document.body.classList.remove('user-sidebar-collapsed');
      document.body.classList.remove('user-sidebar-open');
    }
  }

  private setMobileSidebar(open: boolean): void {
    this.mobileSidebarOpen = open;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('user-sidebar-open', open);
    }
  }
}
