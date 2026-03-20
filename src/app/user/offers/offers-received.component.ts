import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { apiUrl } from '../../shared/utils/url';

interface Offer {
  _id: string;
  productId: {
    _id: string;
    name: string;
  };
  buyerId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  offerType: 'SELL' | 'RENT';
  offerAmount: number;
  rentStartDate?: string;
  rentEndDate?: string;
  message?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COUNTERED';
  createdAt: string;
}

@Component({
  selector: 'app-offers-received',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './offers-received.component.html',
  styleUrls: ['./offers-received.component.css']
})
export class OffersReceivedComponent implements OnInit {
  offers: Offer[] = [];
  isLoading = true;
  errorMsg = '';

  showCounterModal = false;
  activeCounterOfferId = '';
  counterAmountInput: number | null = null;
  counterMessageInput = '';
  counterSubmitting = false;
  counterError = '';

  private apiUrl = apiUrl('/offers');

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadOffers();
  }

  loadOffers(): void {
    this.isLoading = true;
    this.errorMsg = '';

    this.http.get<Offer[]>(`${this.apiUrl}/received`).subscribe({
      next: (res) => {
        this.offers = res;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading offers:', err);
        this.errorMsg = err.error?.msg || 'Failed to load offers';
        this.isLoading = false;
      }
    });
  }

  approve(id: string): void {
    if (!confirm('Are you sure you want to approve this offer? This will reject all other offers on this product.')) {
      return;
    }

    this.http.put(`${this.apiUrl}/${id}/approve`, {}).subscribe({
      next: () => {
        alert('Offer approved successfully! Transaction created.');
        this.loadOffers();
      },
      error: (err) => {
        console.error('Error approving offer:', err);
        alert(err.error?.msg || 'Failed to approve offer');
      }
    });
  }

  reject(id: string): void {
    if (!confirm('Are you sure you want to reject this offer?')) {
      return;
    }

    this.http.put(`${this.apiUrl}/${id}/reject`, {}).subscribe({
      next: () => {
        alert('Offer rejected successfully!');
        this.loadOffers();
      },
      error: (err) => {
        console.error('Error rejecting offer:', err);
        alert(err.error?.msg || 'Failed to reject offer');
      }
    });
  }

  openCounterModal(id: string): void {
    this.activeCounterOfferId = id;
    this.counterAmountInput = null;
    this.counterMessageInput = '';
    this.counterError = '';
    this.counterSubmitting = false;
    this.showCounterModal = true;
  }

  closeCounterModal(): void {
    this.showCounterModal = false;
    this.activeCounterOfferId = '';
    this.counterAmountInput = null;
    this.counterMessageInput = '';
    this.counterError = '';
    this.counterSubmitting = false;
  }

  submitCounterModal(): void {
    const amount = Number(this.counterAmountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.counterError = 'Please enter a valid amount greater than 0.';
      return;
    }
    if (!this.activeCounterOfferId) {
      this.counterError = 'Offer not selected. Please reopen counter modal.';
      return;
    }

    this.counterSubmitting = true;
    this.counterError = '';

    this.http.put(`${this.apiUrl}/${this.activeCounterOfferId}/counter`, {
      counterAmount: amount,
      counterMessage: (this.counterMessageInput || '').trim()
    }).subscribe({
      next: () => {
        this.counterSubmitting = false;
        this.closeCounterModal();
        alert('Counter offer sent successfully!');
        this.loadOffers();
      },
      error: (err) => {
        console.error('Error sending counter offer:', err);
        this.counterSubmitting = false;
        this.counterError = err.error?.msg || 'Failed to send counter offer';
      }
    });
  }

  openChat(id: string): void {
    this.router.navigate(['/user/offer-chat', id]);
  }
}
