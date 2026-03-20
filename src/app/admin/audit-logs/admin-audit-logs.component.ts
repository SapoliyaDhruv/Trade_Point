import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { apiUrl } from '../../shared/utils/url';

interface AuditLogRow {
  _id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata: any;
  ipAddress: string;
  createdAt: string;
  admin: {
    _id: string;
    name: string;
    email: string;
  } | null;
}

@Component({
  selector: 'app-admin-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-audit-logs.component.html',
  styleUrls: ['./admin-audit-logs.component.css']
})
export class AdminAuditLogsComponent implements OnInit {
  private readonly apiBase = apiUrl('/admin');

  loading = true;
  error = '';

  items: AuditLogRow[] = [];
  admins: Array<{ _id: string; name: string; email: string }> = [];

  q = '';
  action = '';
  entityType = '';
  adminId = '';
  from = '';
  to = '';

  page = 1;
  limit = 20;
  total = 0;
  totalPages = 1;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAdmins();
    this.loadLogs(true);
  }

  loadAdmins(): void {
    this.http.get<Array<{ _id: string; name: string; email: string }>>(`${this.apiBase}/audit-logs/admins`)
      .subscribe({
        next: (rows) => {
          this.admins = rows || [];
        },
        error: () => {
          this.admins = [];
        }
      });
  }

  loadLogs(resetPage = false): void {
    if (resetPage) this.page = 1;
    this.loading = true;
    this.error = '';

    let params = new HttpParams()
      .set('page', this.page)
      .set('limit', this.limit);

    if (this.q.trim()) params = params.set('q', this.q.trim());
    if (this.action.trim()) params = params.set('action', this.action.trim());
    if (this.entityType.trim()) params = params.set('entityType', this.entityType.trim());
    if (this.adminId) params = params.set('adminId', this.adminId);
    if (this.from) params = params.set('from', this.from);
    if (this.to) params = params.set('to', this.to);

    this.http.get<any>(`${this.apiBase}/audit-logs`, { params }).subscribe({
      next: (res) => {
        this.items = res?.items || [];
        this.total = Number(res?.total || 0);
        this.page = Number(res?.page || this.page);
        this.totalPages = Number(res?.totalPages || 1);
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.msg || 'Failed to load audit logs';
        this.items = [];
        this.total = 0;
        this.totalPages = 1;
        this.loading = false;
      }
    });
  }

  clearFilters(): void {
    this.q = '';
    this.action = '';
    this.entityType = '';
    this.adminId = '';
    this.from = '';
    this.to = '';
    this.loadLogs(true);
  }

  goToPage(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.totalPages || nextPage === this.page) {
      return;
    }
    this.page = nextPage;
    this.loadLogs(false);
  }

  shortMeta(metadata: any): string {
    if (!metadata || typeof metadata !== 'object') return '-';
    const keys = Object.keys(metadata).slice(0, 3);
    if (!keys.length) return '-';
    return keys.map((k) => `${k}: ${String(metadata[k])}`).join(' | ');
  }
}
