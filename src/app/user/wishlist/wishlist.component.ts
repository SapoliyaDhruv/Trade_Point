import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { apiUrl, assetUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './wishlist.component.html',
  styleUrls: ['./wishlist.component.css']
})
export class WishlistComponent implements OnInit {
  items: any[] = [];
  loading = true;
  error = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadWishlist();
  }

  loadWishlist(): void {
    this.loading = true;
    this.error = '';
    this.http.get<any[]>(apiUrl('/users/wishlist')).subscribe({
      next: (res) => {
        this.items = res || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.msg || 'Failed to load wishlist';
        this.loading = false;
      }
    });
  }

  remove(productId: string): void {
    this.http.delete(apiUrl(`/users/wishlist/${productId}`)).subscribe({
      next: () => {
        this.items = this.items.filter((item) => item._id !== productId);
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
