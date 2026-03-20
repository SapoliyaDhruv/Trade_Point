// src/app/user/fake-payment/fake-payment.component.ts

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-fake-payment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fake-payment.component.html',
  styleUrls: ['./fake-payment.component.css']
})
export class FakePaymentComponent implements OnInit {
  transactionId: string | null = null;
  amount: number = 0;
  paymentMethod: 'card' | 'upi' = 'card';

  // Form fields (kept for realistic look)
  card = { number: '', expiry: '', cvv: '', name: '' };
  upi = { id: '' };

  loading = false;
  success = false;
  error = '';

  private apiUrl = apiUrl('/offers');

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.transactionId = this.route.snapshot.paramMap.get('transactionId');
    const amountStr = this.route.snapshot.queryParamMap.get('amount');

    this.amount = amountStr ? Number(amountStr) : 0;

    if (!this.transactionId || this.amount <= 0) {
      this.error = 'Invalid payment session. Please try again from My Offers.';
      setTimeout(() => this.router.navigate(['/user/my-offers']), 3000);
    }
  }

  submitPayment() {
    if (this.loading) return;

    this.loading = true;
    this.error = '';
    this.success = false;

    // Simulate realistic processing delay (1.5–2.5 seconds)
    const delay = 1500 + Math.random() * 1000;

    setTimeout(() => {
      this.http
        .put(`${this.apiUrl}/payment/${this.transactionId}`, {}, {
          headers: { 'Content-Type': 'application/json' }
        })
        .subscribe({
          next: (response: any) => {
            this.success = true;
            this.loading = false;

            // Optional: show more friendly message using backend response
            const msg = response.msg || 'Payment processed successfully!';
            console.log('Payment success:', msg);

            // Auto-redirect after showing success for 3 seconds
            setTimeout(() => {
              this.router.navigate(['/user/my-offers']);
            }, 3000);
          },
          error: (err) => {
            this.loading = false;
            console.error('Payment error:', err);

            this.error = err.error?.msg 
              || 'Payment processing failed. Please try again or contact support.';
          }
        });
    }, delay);
  }

  // Simple client-side validation for form appearance
  get canPay(): boolean {
    if (this.paymentMethod === 'card') {
      return (
        this.card.number.replace(/\s/g, '').length >= 16 &&
        this.card.expiry.length >= 5 &&
        this.card.cvv.length === 3 &&
        this.card.name.trim().length > 2
      );
    } else {
      return this.upi.id.trim().length > 5 && this.upi.id.includes('@');
    }
  }

  goToOffers() {
    this.router.navigate(['/user/my-offers']);
  }
}
