import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-admin-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-chat.component.html',
  styleUrls: ['./admin-chat.component.css']
})
export class AdminChatComponent implements OnInit {
  messages: any[] = [];
  messageText = '';
  loading = true;
  sending = false;
  error = '';
  currentAdminId = '';

  private apiUrl = apiUrl('/admin/chat/messages');

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadMessages();
  }

  loadMessages(): void {
    this.loading = true;
    this.error = '';
    this.http.get<any>(this.apiUrl).subscribe({
      next: (res) => {
        this.messages = res?.messages || [];
        this.currentAdminId = res?.currentAdminId || '';
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.msg || 'Failed to load admin chat.';
        this.loading = false;
      }
    });
  }

  sendMessage(): void {
    const text = this.messageText.trim();
    if (!text || this.sending) return;

    this.sending = true;
    this.error = '';
    this.http.post<any>(this.apiUrl, { message: text }).subscribe({
      next: (res) => {
        if (res?.message) {
          this.messages = [...this.messages, res.message];
        }
        this.messageText = '';
        this.sending = false;
      },
      error: (err) => {
        this.error = err.error?.msg || 'Failed to send message.';
        this.sending = false;
      }
    });
  }

  isMine(msg: any): boolean {
    return msg?.admin?._id === this.currentAdminId;
  }
}
