import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { apiUrl, assetUrl } from '../../shared/utils/url';

interface CalendarDay {
  date: Date;
  key: string;
  inMonth: boolean;
  outCount: number;
  inCount: number;
}

@Component({
  selector: 'app-my-rentals',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-rentals.component.html',
  styleUrls: ['./my-rentals.component.css']
})
export class MyRentalsComponent implements OnInit {
  rentalsAsSeller: any[] = [];
  rentalsAsBuyer: any[] = [];
  loading = true;
  error = '';

  dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  calendarMode: 'all' | 'out' | 'in' = 'all';
  currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  monthLabel = '';
  calendarWeeks: CalendarDay[][] = [];

  private apiUrl = apiUrl('/rentals/my');

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadRentals();
  }

  loadRentals() {
    this.loading = true;
    this.error = '';

    forkJoin({
      seller: this.http.get<any[]>(`${this.apiUrl}?type=seller`),
      buyer: this.http.get<any[]>(`${this.apiUrl}?type=buyer`)
    }).subscribe({
      next: ({ seller, buyer }) => {
        this.rentalsAsSeller = seller || [];
        this.rentalsAsBuyer = buyer || [];
        this.buildCalendar();
        this.loading = false;
      },
      error: (err) => {
        console.error('[My Rentals] Failed to load:', err);
        this.error = 'Failed to load rentals. Please check your connection or try again later.';
        this.loading = false;
      }
    });
  }

  refresh() {
    this.loadRentals();
  }

  previousMonth() {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    this.buildCalendar();
  }

  nextMonth() {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
    this.buildCalendar();
  }

  goToCurrentMonth() {
    const now = new Date();
    this.currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this.buildCalendar();
  }

  changeCalendarMode(mode: 'all' | 'out' | 'in') {
    this.calendarMode = mode;
    this.buildCalendar();
  }

  isToday(day: CalendarDay): boolean {
    const now = new Date();
    return day.date.getFullYear() === now.getFullYear()
      && day.date.getMonth() === now.getMonth()
      && day.date.getDate() === now.getDate();
  }

  get totalBookedDays(): number {
    return this.calendarWeeks.flat().reduce((sum, day) => {
      if (!day.inMonth) return sum;
      const count = this.calendarMode === 'out'
        ? day.outCount
        : this.calendarMode === 'in'
          ? day.inCount
          : (day.outCount + day.inCount);
      return sum + (count > 0 ? 1 : 0);
    }, 0);
  }

  dayTooltip(day: CalendarDay): string {
    const parts: string[] = [];
    if (day.outCount > 0) parts.push(`Rented Out: ${day.outCount}`);
    if (day.inCount > 0) parts.push(`Rented By Me: ${day.inCount}`);
    return parts.length ? parts.join(' | ') : 'No rentals';
  }

  requestReturn(transactionId: string) {
    const note = prompt('Any note for seller? (optional)');
    this.http.put(apiUrl('/rentals/request-return'), { transactionId, note }).subscribe({
      next: () => {
        alert('Return request sent successfully!');
        this.loadRentals();
      },
      error: (err) => {
        alert('Failed to send return request: ' + (err.error?.msg || 'Unknown error'));
      }
    });
  }

  confirmReturn(transactionId: string) {
    const note = prompt('Any note for buyer? (optional)');
    this.http.put(apiUrl('/rentals/confirm-return'), { transactionId, note }).subscribe({
      next: () => {
        alert('Return confirmed successfully!');
        this.loadRentals();
      },
      error: (err) => {
        alert('Failed to confirm return: ' + (err.error?.msg || 'Unknown error'));
      }
    });
  }

  payPenalty(transactionId: string) {
    if (!confirm('Pay penalty now?')) return;

    this.http.put(apiUrl('/rentals/pay-penalty'), { transactionId }).subscribe({
      next: (res: any) => {
        alert(res?.msg || 'Penalty payment successful');
        this.loadRentals();
      },
      error: (err) => {
        alert('Failed to pay penalty: ' + (err.error?.msg || 'Unknown error'));
      }
    });
  }

  handleImageError(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/placeholder-product.jpg';
  }

  getImageUrl(path?: string): string {
    if (!path) return 'assets/placeholder-product.jpg';
    return assetUrl(path);
  }

  private buildCalendar() {
    const firstDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1);
    const lastDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 0);
    this.monthLabel = firstDay.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const counts = new Map<string, { outCount: number; inCount: number }>();

    if (this.calendarMode === 'all' || this.calendarMode === 'out') {
      this.addRentalRanges(this.rentalsAsSeller, 'out', counts);
    }
    if (this.calendarMode === 'all' || this.calendarMode === 'in') {
      this.addRentalRanges(this.rentalsAsBuyer, 'in', counts);
    }

    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    const end = new Date(lastDay);
    end.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

    const weeks: CalendarDay[][] = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      const week: CalendarDay[] = [];
      for (let i = 0; i < 7; i++) {
        const key = this.dateKey(cursor);
        const value = counts.get(key) || { outCount: 0, inCount: 0 };
        week.push({
          date: new Date(cursor),
          key,
          inMonth: cursor.getMonth() === this.currentMonth.getMonth(),
          outCount: value.outCount,
          inCount: value.inCount
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }

    this.calendarWeeks = weeks;
  }

  private addRentalRanges(
    rentals: any[],
    mode: 'out' | 'in',
    map: Map<string, { outCount: number; inCount: number }>
  ) {
    for (const item of rentals || []) {
      const startDateRaw = item?.rentalId?.startDate;
      const endDateRaw = item?.rentalId?.endDate;
      if (!startDateRaw || !endDateRaw) continue;

      const start = new Date(startDateRaw);
      const end = new Date(endDateRaw);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

      while (cursor <= last) {
        const key = this.dateKey(cursor);
        const current = map.get(key) || { outCount: 0, inCount: 0 };
        if (mode === 'out') current.outCount += 1;
        if (mode === 'in') current.inCount += 1;
        map.set(key, current);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  private dateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
