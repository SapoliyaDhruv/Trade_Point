import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-my-offers',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './my-offers.component.html',
  styleUrls: ['./my-offers.component.css']
})
export class MyOffersComponent implements OnInit {

  offers: any[] = [];
  loading = true;
  error = '';

  private apiUrl = apiUrl('/offers');

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadMySentOffers();
  }

  loadMySentOffers() {
    this.loading = true;
    this.http.get<any[]>(`${this.apiUrl}/my-sent`).subscribe({
      next: (data) => {
        console.log('[DEBUG] === Offers loaded from /my-sent ===');
        console.log('[DEBUG] Number of offers:', data?.length || 0);
        console.log('[DEBUG] Raw data:', JSON.stringify(data, null, 2));

        // Find offers that SHOULD show Pay Now button
        const candidates = data?.filter(o => 
          (o.status === 'ACCEPTED' || o.status === 'APPROVED') && o.transactionId
        ) || [];

        if (candidates.length > 0) {
          console.log('[DEBUG] Offers eligible for Pay Now:', candidates.length);
          candidates.forEach((o, i) => {
            console.log(`[DEBUG] Eligible offer #${i+1}:`, {
              id: o._id,
              status: o.status,
              transactionId: o.transactionId,
              paymentStatus: o.paymentStatus || 'missing',
              totalAmount: o.totalAmount || 'missing'
            });
          });
        } else {
          console.log('[DEBUG] No offers eligible for Pay Now yet');
          console.log('[DEBUG] Possible reasons:');
          console.log('[DEBUG]   - No ACCEPTED/APPROVED status');
          console.log('[DEBUG]   - No transactionId field');
          console.log('[DEBUG]   - paymentStatus already PAID');
        }

        this.offers = data || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('[ERROR] Failed to load offers:', err);
        this.error = err.error?.msg || 'Could not load your offers';
        this.loading = false;
      }
    });
  }

  acceptCounter(offerId: string) {
    if (!confirm('Do you want to accept this counter offer?')) return;

    this.http.put(`${this.apiUrl}/${offerId}/accept-counter`, {})
      .subscribe({
        next: (response: any) => {
          console.log('[DEBUG] acceptCounter success:', response);
          alert('Counter offer accepted! Refreshing list...');
          setTimeout(() => this.loadMySentOffers(), 1000);
        },
        error: (err) => {
          console.error('[ERROR] acceptCounter failed:', err);
          alert(err.error?.msg || 'Failed to accept the counter offer');
        }
      });
  }

  rejectCounter(offerId: string) {
    if (!confirm('Reject this counter offer?')) return;

    this.http.put(`${this.apiUrl}/${offerId}/reject-counter`, {})
      .subscribe({
        next: () => {
          alert('Counter rejected.');
          this.loadMySentOffers();
        },
        error: (err) => {
          alert(err.error?.msg || 'Failed to reject the counter');
        }
      });
  }

  goToPayment(transactionId: string, amount: number) {
    if (!transactionId) {
      alert('No transaction ID found. Please refresh the page.');
      return;
    }

    console.log('[DEBUG] Going to payment → transactionId:', transactionId, 'amount:', amount);

    this.router.navigate(['/user/fake-payment', transactionId], {
      queryParams: { amount: Math.round(amount) }
    });
  }

  openChat(offerId: string) {
    this.router.navigate(['/user/offer-chat', offerId]);
  }
}
