import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit {
  loading = true;
  error = '';

  stats = {
    totalBuyers: 0,
    currentRentedItems: 0,
    totalSales: 0,
    totalRentDeals: 0,
    totalRevenue: 0,
    grossRevenue: 0,
    totalWithdrawn: 0,
    availableBalance: 0,
    totalListings: 0,
    approvedListings: 0
  };

  withdrawals: Array<{ amount: number; reference: string; createdAt: string }> = [];
  isWithdrawing = false;
  payout = {
    payoutReady: false,
    payoutMethod: 'none',
    maskedAccountNumber: '',
    bankName: '',
    upiId: ''
  };

  analytics = {
    monthly: [] as Array<{ label: string; sales: number; rentals: number; revenue: number }>,
    conversionRate: 0,
    activeListings: 0
  };

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      stats: this.http.get<any>(apiUrl('/users/dashboard-stats')),
      analytics: this.http.get<any>(apiUrl('/users/dashboard-analytics')),
      wallet: this.http.get<any>(apiUrl('/users/wallet'))
    }).subscribe({
      next: ({ stats, analytics, wallet }) => {
        this.stats = {
          ...this.stats,
          ...(stats || {}),
          grossRevenue: Number(wallet?.totalEarned || stats?.grossRevenue || 0),
          totalWithdrawn: Number(wallet?.totalWithdrawn || stats?.totalWithdrawn || 0),
          availableBalance: Number(wallet?.availableBalance || stats?.availableBalance || 0),
          totalRevenue: Number(wallet?.availableBalance || stats?.totalRevenue || 0)
        };
        this.analytics = {
          ...this.analytics,
          ...(analytics || {}),
          monthly: analytics?.monthly || []
        };
        this.withdrawals = wallet?.withdrawals || [];
        this.payout = {
          payoutReady: Boolean(wallet?.payout?.payoutReady),
          payoutMethod: wallet?.payout?.payoutMethod || 'none',
          maskedAccountNumber: wallet?.payout?.maskedAccountNumber || '',
          bankName: wallet?.payout?.bankName || '',
          upiId: wallet?.payout?.upiId || ''
        };
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.msg || 'Unable to load dashboard data';
      }
    });
  }

  getRevenueBarWidth(value: number): number {
    const max = Math.max(...(this.analytics.monthly.map((m) => Number(m.revenue || 0))), 1);
    return Math.max(8, Math.round((Number(value || 0) / max) * 100));
  }

  getDealsBarWidth(sales: number, rentals: number): number {
    const current = Number(sales || 0) + Number(rentals || 0);
    const max = Math.max(...(this.analytics.monthly.map((m) => Number(m.sales || 0) + Number(m.rentals || 0))), 1);
    return Math.max(8, Math.round((current / max) * 100));
  }

  withdrawEarnings(): void {
    if (!this.payout.payoutReady) {
      alert('Please set payout account details in Profile before withdrawing.');
      this.router.navigate(['/user/profile']);
      return;
    }

    const input = prompt(`Enter amount to withdraw (Available: Rs. ${this.stats.availableBalance})`);
    if (input === null) return;

    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid amount greater than 0');
      return;
    }

    if (amount > this.stats.availableBalance) {
      alert(`Amount exceeds available balance (Rs. ${this.stats.availableBalance})`);
      return;
    }

    this.isWithdrawing = true;
    this.http.post<any>(apiUrl('/users/wallet/withdraw'), { amount }).subscribe({
      next: (res) => {
        alert(res?.msg || 'Withdrawal completed');
        this.isWithdrawing = false;
        this.loadDashboard();
      },
      error: (err) => {
        this.isWithdrawing = false;
        alert(err.error?.msg || 'Withdrawal failed');
      }
    });
  }
}
