import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-user-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-notifications.component.html',
  styleUrls: ['./user-notifications.component.css']
})
export class UserNotificationsComponent implements OnInit {
  items: any[] = [];
  loading = true;
  error = '';

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.loading = true;
    this.error = '';
    this.http.get<any[]>(apiUrl('/users/notifications?limit=100')).subscribe({
      next: (res) => {
        this.items = res || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.msg || 'Failed to load notifications';
        this.loading = false;
      }
    });
  }

  markRead(item: any): void {
    if (item.isRead) {
      return;
    }
    this.http.put(apiUrl(`/users/notifications/${item._id}/read`), {}).subscribe({
      next: () => {
        item.isRead = true;
      }
    });
  }

  markAllRead(): void {
    this.http.put(apiUrl('/users/notifications/read-all'), {}).subscribe({
      next: () => {
        this.items = this.items.map((item) => ({ ...item, isRead: true }));
      }
    });
  }

  open(item: any): void {
    this.markRead(item);
    if (!item.link) {
      return;
    }
    this.router.navigateByUrl(item.link);
  }
}
