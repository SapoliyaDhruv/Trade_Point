import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { apiUrl, assetUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-recently-viewed',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './recently-viewed.component.html',
  styleUrls: ['./recently-viewed.component.css']
})
export class RecentlyViewedComponent implements OnInit {
  items: any[] = [];
  loading = true;
  error = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadItems();
  }

  loadItems(): void {
    this.loading = true;
    this.error = '';
    this.http.get<any[]>(apiUrl('/users/recently-viewed')).subscribe({
      next: (res) => {
        this.items = res || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.msg || 'Failed to load recently viewed products';
        this.loading = false;
      }
    });
  }

  getImage(path?: string): string {
    if (!path) return 'assets/placeholder-product.jpg';
    return assetUrl(path.replace(/\\/g, '/'));
  }

  getPriceLabel(item: any): string {
    if (item.type === 'sale') {
      return `Rs. ${item.salePriceMin} - Rs. ${item.salePriceMax}`;
    }
    return `Rs. ${item.rentPricePerDay} / day`;
  }
}
