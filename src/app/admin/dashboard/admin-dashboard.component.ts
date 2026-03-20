import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { apiUrl } from '../../shared/utils/url';

interface DashboardOverview {
  users: {
    totalUsers: number;
    verifiedUsers: number;
    unverifiedUsers: number;
  };
  products: {
    totalProducts: number;
    pendingProducts: number;
    approvedProducts: number;
    soldProducts: number;
    rentedProducts: number;
    activeProducts: number;
  };
  transactions: {
    totalTransactions: number;
    pendingTransactions: number;
    approvedTransactions: number;
    rejectedTransactions: number;
  };
  finance: {
    grossVolume: number;
    platformRevenue: number;
    sellerPayouts: number;
  };
  recentPendingTransactions: Array<{
    _id: string;
    productName: string;
    productType: string;
    buyerName: string;
    sellerName: string;
    totalAmount: number;
    createdAt: string;
  }>;
}

interface AnalyticsData {
  days: number;
  labels: string[];
  series: {
    newUsers: number[];
    newProducts: number[];
    approvedTransactions: number[];
    grossVolume: number[];
  };
  totals: {
    newUsers: number;
    newProducts: number;
    approvedTransactions: number;
    grossVolume: number;
  };
}

interface RiskFlagsData {
  highValueThreshold: number;
  highValuePending: Array<{
    _id: string;
    amount: number;
    createdAt: string;
    productName: string;
    buyerName: string;
    buyerEmail: string;
  }>;
  stalePending: Array<{
    _id: string;
    amount: number;
    createdAt: string;
    productName: string;
    buyerName: string;
    buyerEmail: string;
  }>;
  repeatedRejectedBuyers: Array<{
    buyerId: string;
    name: string;
    email: string;
    rejectedCount: number;
  }>;
  flaggedProducts: Array<{
    _id: string;
    name: string;
    type: string;
    flags: string[];
    createdAt: string;
    category: string;
    sellerName: string;
  }>;
}

interface CommissionData {
  defaultCommissionPercent: number;
  categories: Array<{
    _id: string;
    name: string;
    status: string;
    feePercentage: number;
  }>;
}

interface ModerationData {
  keywords: string[];
  flaggedPendingProducts: Array<{
    _id: string;
    name: string;
    type: string;
    category: string;
    sellerName: string;
    sellerEmail: string;
    flags: string[];
    createdAt: string;
  }>;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {
  private readonly apiBase = apiUrl('/admin');

  loading = true;
  error = '';
  overview: DashboardOverview | null = null;

  analyticsLoading = false;
  analytics: AnalyticsData | null = null;
  analyticsDays = 14;

  riskLoading = false;
  riskFlags: RiskFlagsData | null = null;

  commissionLoading = false;
  commissionData: CommissionData | null = null;
  defaultCommissionPercent = 10;
  applyDefaultToAllCategories = false;
  categoryFeeDrafts: Record<string, number> = {};

  moderationLoading = false;
  moderationData: ModerationData | null = null;
  moderationKeywordsInput = '';

  broadcastTarget: 'all' | 'verified' | 'unverified' | 'sellers' | 'buyers' = 'all';
  broadcastTitle = '';
  broadcastMessage = '';
  broadcastLink = '';
  sendingBroadcast = false;
  broadcastStatus = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loadOverview();
    this.loadAnalytics(this.analyticsDays);
    this.loadRiskFlags();
    this.loadCommission();
    this.loadModeration();
  }

  loadOverview(): void {
    this.loading = true;
    this.error = '';

    this.http.get<DashboardOverview>(`${this.apiBase}/dashboard-overview`)
      .subscribe({
        next: (data) => {
          this.overview = data;
          this.loading = false;
        },
        error: (err) => {
          this.error = err?.error?.msg || 'Failed to load admin dashboard data';
          this.loading = false;
        }
      });
  }

  loadAnalytics(days: number = this.analyticsDays): void {
    this.analyticsLoading = true;
    this.analyticsDays = days;
    this.http.get<AnalyticsData>(`${this.apiBase}/analytics?days=${days}`)
      .subscribe({
        next: (data) => {
          this.analytics = data;
          this.analyticsLoading = false;
        },
        error: () => {
          this.analyticsLoading = false;
        }
      });
  }

  loadRiskFlags(): void {
    this.riskLoading = true;
    this.http.get<RiskFlagsData>(`${this.apiBase}/risk-flags`)
      .subscribe({
        next: (data) => {
          this.riskFlags = data;
          this.riskLoading = false;
        },
        error: () => {
          this.riskLoading = false;
        }
      });
  }

  loadCommission(): void {
    this.commissionLoading = true;
    this.http.get<CommissionData>(`${this.apiBase}/commission`)
      .subscribe({
        next: (data) => {
          this.commissionData = data;
          this.defaultCommissionPercent = Number(data.defaultCommissionPercent || 10);
          this.categoryFeeDrafts = {};
          for (const category of data.categories || []) {
            this.categoryFeeDrafts[category._id] = Number(category.feePercentage || 0);
          }
          this.commissionLoading = false;
        },
        error: () => {
          this.commissionLoading = false;
        }
      });
  }

  saveDefaultCommission(): void {
    const defaultCommissionPercent = Number(this.defaultCommissionPercent);
    if (Number.isNaN(defaultCommissionPercent) || defaultCommissionPercent < 0 || defaultCommissionPercent > 100) {
      alert('Default commission must be between 0 and 100');
      return;
    }

    this.http.put(`${this.apiBase}/commission/default`, {
      defaultCommissionPercent,
      applyToAllCategories: this.applyDefaultToAllCategories
    }).subscribe({
      next: () => {
        alert('Default commission updated');
        this.loadCommission();
        this.loadOverview();
      },
      error: (err) => alert(err?.error?.msg || 'Failed to update default commission')
    });
  }

  saveCategoryCommission(categoryId: string): void {
    const feePercentage = Number(this.categoryFeeDrafts[categoryId]);
    if (Number.isNaN(feePercentage) || feePercentage < 0 || feePercentage > 100) {
      alert('Category commission must be between 0 and 100');
      return;
    }

    this.http.put(`${this.apiBase}/commission/category/${categoryId}`, { feePercentage })
      .subscribe({
        next: () => {
          alert('Category commission updated');
          this.loadCommission();
        },
        error: (err) => alert(err?.error?.msg || 'Failed to update category commission')
      });
  }

  loadModeration(): void {
    this.moderationLoading = true;
    this.http.get<ModerationData>(`${this.apiBase}/moderation`)
      .subscribe({
        next: (data) => {
          this.moderationData = data;
          this.moderationKeywordsInput = (data.keywords || []).join(', ');
          this.moderationLoading = false;
        },
        error: () => {
          this.moderationLoading = false;
        }
      });
  }

  saveModerationKeywords(rescanPending: boolean): void {
    const keywords = this.moderationKeywordsInput
      .split(/[,\n]/g)
      .map((x) => x.trim())
      .filter(Boolean);

    if (!keywords.length) {
      alert('Enter at least one moderation keyword');
      return;
    }

    this.http.put(`${this.apiBase}/moderation/keywords`, { keywords, rescanPending })
      .subscribe({
        next: (res: any) => {
          const rescanned = Number(res?.rescannedCount || 0);
          alert(`Moderation keywords updated${rescanPending ? `. Rescanned: ${rescanned}` : ''}`);
          this.loadModeration();
          this.loadRiskFlags();
        },
        error: (err) => alert(err?.error?.msg || 'Failed to update moderation keywords')
      });
  }

  sendBroadcast(): void {
    if (!this.broadcastTitle.trim() || !this.broadcastMessage.trim()) {
      alert('Title and message are required');
      return;
    }

    this.sendingBroadcast = true;
    this.broadcastStatus = '';

    this.http.post(`${this.apiBase}/notifications/broadcast`, {
      target: this.broadcastTarget,
      title: this.broadcastTitle.trim(),
      message: this.broadcastMessage.trim(),
      link: this.broadcastLink.trim()
    }).subscribe({
      next: (res: any) => {
        this.sendingBroadcast = false;
        this.broadcastStatus = `Sent to ${res?.sentCount || 0} users`;
        this.broadcastTitle = '';
        this.broadcastMessage = '';
        this.broadcastLink = '';
      },
      error: (err) => {
        this.sendingBroadcast = false;
        this.broadcastStatus = err?.error?.msg || 'Failed to send broadcast';
      }
    });
  }

  maxFrom(values: number[]): number {
    return Math.max(1, ...(values || [0]));
  }

  barHeight(value: number, maxValue: number): string {
    const ratio = Math.max(0, Math.min(100, Math.round((value / Math.max(1, maxValue)) * 100)));
    return `${ratio}%`;
  }

  shortDate(dateKey: string): string {
    const dt = new Date(dateKey);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
