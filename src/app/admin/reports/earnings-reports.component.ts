import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { apiUrl } from '../../shared/utils/url';

type EarningsRange = 'week' | 'month' | 'year' | 'custom';
type EarningsGroupBy = 'day' | 'week' | 'month' | 'user';

interface EarningsReportUser {
  _id: string;
  name: string;
  email: string;
  totalDeals: number;
  totalEarning: number;
}

interface EarningsReportResponse {
  filterSummary: {
    range: EarningsRange;
    label: string;
    start: string;
    end: string;
    groupBy: EarningsGroupBy;
    userId: string | null;
    selectedUser: {
      _id: string;
      name: string;
      email: string;
    } | null;
  };
  totals: {
    platformEarnings: number;
    sellerEarnings: number;
    grossVolume: number;
    dealCount: number;
  };
  userBreakdown: Array<{
    _id: string;
    name: string;
    email: string;
    sellerEarnings: number;
    platformContribution: number;
    grossVolume: number;
    dealCount: number;
  }>;
  trend: Array<{
    label: string;
    platformEarnings: number;
    sellerEarnings: number;
    grossVolume: number;
    dealCount: number;
  }>;
  recentApprovedTransactions: Array<{
    _id: string;
    approvedAt: string;
    totalAmount: number;
    platformFee: number;
    ownerAmount: number;
    productName: string;
    productType: string;
    sellerName: string;
    sellerEmail: string;
    buyerName: string;
    buyerEmail: string;
  }>;
}

@Component({
  selector: 'app-admin-earnings-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './earnings-reports.component.html',
  styleUrls: ['./earnings-reports.component.css']
})
export class AdminEarningsReportsComponent implements OnInit {
  private readonly apiBase = apiUrl('/admin');

  reportUsersLoading = false;
  reportUsers: EarningsReportUser[] = [];

  earningsLoading = false;
  earningsError = '';
  earningsReport: EarningsReportResponse | null = null;

  reportRange: EarningsRange = 'month';
  reportGroupBy: EarningsGroupBy = 'day';
  reportYear = new Date().getFullYear();
  reportMonth = new Date().getMonth() + 1;
  reportWeekStart = this.toInputDate(new Date());
  reportFrom = this.toInputDate(new Date(new Date().setDate(new Date().getDate() - 30)));
  reportTo = this.toInputDate(new Date());
  reportUserId = '';
  exportingEarnings = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadReportUsers();
    this.loadEarningsReport();
  }

  onReportRangeChange(): void {
    if (this.reportRange === 'year') {
      this.reportGroupBy = 'month';
      return;
    }

    if (this.reportRange === 'week') {
      this.reportGroupBy = 'day';
      return;
    }

    if (this.reportRange === 'month') {
      this.reportGroupBy = 'day';
    }
  }

  loadReportUsers(): void {
    this.reportUsersLoading = true;
    this.http.get<EarningsReportUser[]>(`${this.apiBase}/reports/users`)
      .subscribe({
        next: (rows) => {
          this.reportUsers = rows || [];
          this.reportUsersLoading = false;
        },
        error: () => {
          this.reportUsers = [];
          this.reportUsersLoading = false;
        }
      });
  }

  loadEarningsReport(): void {
    this.earningsLoading = true;
    this.earningsError = '';

    const params = this.buildEarningsQueryParams();
    this.http.get<EarningsReportResponse>(`${this.apiBase}/reports/earnings?${params}`)
      .subscribe({
        next: (data) => {
          this.earningsReport = data;
          this.earningsLoading = false;
        },
        error: (err) => {
          this.earningsReport = null;
          this.earningsError = err?.error?.msg || 'Failed to load earnings report';
          this.earningsLoading = false;
        }
      });
  }

  exportEarningsCsv(): void {
    this.exportingEarnings = true;
    const params = this.buildEarningsQueryParams();
    this.http.get(`${this.apiBase}/reports/earnings/export?${params}`, { responseType: 'blob' })
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `earnings-report-${this.toInputDate(new Date())}.csv`;
          anchor.click();
          URL.revokeObjectURL(url);
          this.exportingEarnings = false;
        },
        error: () => {
          this.exportingEarnings = false;
          alert('Failed to export CSV report');
        }
      });
  }

  private buildEarningsQueryParams(): string {
    const params = new URLSearchParams();
    params.set('range', this.reportRange);
    params.set('groupBy', this.reportGroupBy);

    if (this.reportRange === 'month') {
      params.set('year', String(this.reportYear));
      params.set('month', String(this.reportMonth));
    }

    if (this.reportRange === 'year') {
      params.set('year', String(this.reportYear));
    }

    if (this.reportRange === 'week' && this.reportWeekStart) {
      params.set('weekStart', this.reportWeekStart);
    }

    if (this.reportRange === 'custom') {
      params.set('from', this.reportFrom);
      params.set('to', this.reportTo);
    }

    if (this.reportUserId) {
      params.set('userId', this.reportUserId);
    }

    return params.toString();
  }

  private toInputDate(date: Date): string {
    const d = new Date(date);
    const month = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }
}
