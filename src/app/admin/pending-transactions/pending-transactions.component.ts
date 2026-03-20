import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-pending-transactions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pending-transactions.component.html',
  styleUrls: ['./pending-transactions.component.css']
})
export class PendingTransactionsComponent implements OnInit {
  transactions: any[] = [];
  loading = true;
  error = '';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadPendingTransactions();
  }

  loadPendingTransactions() {
    this.loading = true;
    this.error = '';
    this.http.get<any[]>(apiUrl('/admin/transactions/pending'))
      .subscribe({
        next: (data) => {
          this.transactions = data;
          this.loading = false;
        },
        error: (err) => {
          this.error = err.error?.msg || 'Failed to load pending transactions';
          this.loading = false;
        }
      });
  }

  approve(tx: any) {
    if (!confirm(`Approve payment of Rs ${tx.totalAmount} for ${tx.productId?.name || 'product'}?`)) return;

    this.http.put(apiUrl(`/admin/transactions/${tx._id}/approve`), { note: 'Approved via admin panel' })
      .subscribe({
        next: () => {
          alert('Transaction approved');
          this.loadPendingTransactions();
        },
        error: (err) => alert(err.error?.msg || 'Failed to approve')
      });
  }

  reject(tx: any) {
    const note = prompt('Reason for rejection (optional):');
    if (note === null) return;

    this.http.put(apiUrl(`/admin/transactions/${tx._id}/reject`), { note })
      .subscribe({
        next: () => {
          alert('Transaction rejected');
          this.loadPendingTransactions();
        },
        error: (err) => alert(err.error?.msg || 'Failed to reject')
      });
  }
}
