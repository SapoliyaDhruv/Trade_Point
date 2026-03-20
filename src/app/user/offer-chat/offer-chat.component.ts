import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-offer-chat',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './offer-chat.component.html',
  styleUrls: ['./offer-chat.component.css']
})
export class OfferChatComponent implements OnInit {
  offerId = '';
  productName = '';
  status = '';
  messages: any[] = [];
  messageText = '';
  loading = true;
  sending = false;
  error = '';
  currentUserSide: 'buyer' | 'owner' = 'buyer';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.offerId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.offerId) {
      this.error = 'Offer not found';
      this.loading = false;
      return;
    }
    this.loadMessages();
  }

  loadMessages(): void {
    this.loading = true;
    this.http.get<any>(apiUrl(`/offers/${this.offerId}/messages`)).subscribe({
      next: (res) => {
        this.productName = res?.product?.name || 'Offer Chat';
        this.status = res?.status || '';
        this.currentUserSide = res?.currentUserSide || 'buyer';
        this.messages = res?.messages || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.msg || 'Failed to load messages';
        this.loading = false;
      }
    });
  }

  sendMessage(): void {
    const text = this.messageText.trim();
    if (!text || this.sending) {
      return;
    }
    this.sending = true;

    this.http.post<any>(apiUrl(`/offers/${this.offerId}/messages`), { message: text }).subscribe({
      next: (res) => {
        if (res?.message) {
          this.messages = [...this.messages, res.message];
        }
        this.messageText = '';
        this.sending = false;
      },
      error: (err) => {
        this.error = err.error?.msg || 'Failed to send message';
        this.sending = false;
      }
    });
  }

  isMine(msg: any): boolean {
    return msg?.from === this.currentUserSide;
  }
}
