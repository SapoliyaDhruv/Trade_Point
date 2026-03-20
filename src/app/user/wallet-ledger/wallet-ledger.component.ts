import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { apiUrl } from '../../shared/utils/url';

interface LedgerItem {
  _id: string;
  direction: 'CREDIT' | 'DEBIT';
  entryType: 'ESCROW' | 'PENALTY' | 'WITHDRAWAL' | 'ADJUSTMENT';
  status: 'PENDING' | 'POSTED' | 'REVERSED';
  amount: number;
  effectiveAmount: number;
  signedAmount: number;
  reference: string;
  description: string;
  createdAt: string;
  settledAt?: string | null;
}

@Component({
  selector: 'app-wallet-ledger',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wallet-ledger.component.html',
  styleUrls: ['./wallet-ledger.component.css']
})
export class WalletLedgerComponent implements OnInit {
  private readonly apiBase = apiUrl('/users');

  loading = true;
  error = '';

  wallet = {
    totalEarned: 0,
    totalWithdrawn: 0,
    availableBalance: 0
  };

  items: LedgerItem[] = [];
  total = 0;
  page = 1;
  limit = 15;
  totalPages = 1;

  status = '';
  direction = '';
  entryType = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadWallet();
    this.loadLedger(true);
  }

  loadWallet(): void {
    this.http.get<any>(`${this.apiBase}/wallet`).subscribe({
      next: (res) => {
        this.wallet = {
          totalEarned: Number(res?.totalEarned || 0),
          totalWithdrawn: Number(res?.totalWithdrawn || 0),
          availableBalance: Number(res?.availableBalance || 0)
        };
      }
    });
  }

  loadLedger(resetPage = false): void {
    if (resetPage) this.page = 1;
    this.loading = true;
    this.error = '';

    let params = new HttpParams()
      .set('page', this.page)
      .set('limit', this.limit);

    if (this.status) {
      params = params.set('status', this.status);
    }
    if (this.direction) {
      params = params.set('direction', this.direction);
    }
    if (this.entryType) {
      params = params.set('entryType', this.entryType);
    }

    this.http.get<any>(`${this.apiBase}/wallet/ledger`, { params }).subscribe({
      next: (res) => {
        this.items = res?.items || [];
        this.total = Number(res?.total || 0);
        this.page = Number(res?.page || this.page);
        this.totalPages = Number(res?.totalPages || 1);
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.msg || 'Failed to load wallet ledger';
        this.items = [];
        this.total = 0;
        this.totalPages = 1;
        this.loading = false;
      }
    });
  }

  clearFilters(): void {
    this.status = '';
    this.direction = '';
    this.entryType = '';
    this.loadLedger(true);
  }

  goToPage(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.totalPages || nextPage === this.page) {
      return;
    }
    this.page = nextPage;
    this.loadLedger(false);
  }
}
