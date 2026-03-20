import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { apiUrl, assetUrl } from '../../../shared/utils/url';

interface Product {
  _id: string;
  name: string;
  seller: { firstName: string; lastName: string; email: string }; // populated
  category: { name: string }; // populated
  type: 'sale' | 'rent';
  salePriceMin?: number;
  salePriceMax?: number;
  rentPricePerDay?: number;
  photos: string[];
  status: 'pending' | 'approved' | 'rejected';
}

@Component({
  selector: 'app-approve-products',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './approve-products.component.html',
  styleUrls: ['./approve-products.component.css']
})
export class ApproveProductsComponent implements OnInit {
  products: Product[] = [];
  isLoading = true;
  errorMsg = '';

  // Pagination (client-side simple)
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;

  private apiUrl = apiUrl('/products/admin');

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadPendingProducts();
  }

  loadPendingProducts() {
    this.isLoading = true;
    this.http.get<Product[]>(`${this.apiUrl}/pending`).subscribe({
      next: (data) => {
        this.products = data;
        this.totalPages = Math.ceil(this.products.length / this.pageSize);
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMsg = err.error?.msg || 'Failed to load products';
        this.isLoading = false;
        console.error(err);
      }
    });
  }

  get displayedProducts(): Product[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.products.slice(start, start + this.pageSize);
  }

  getPrice(product: Product): string {
    if (product.type === 'sale') {
      if (product.salePriceMin && product.salePriceMax) {
        return `₹${product.salePriceMin.toLocaleString()} - ₹${product.salePriceMax.toLocaleString()}`;
      }
      return 'N/A';
    } else {
      return product.rentPricePerDay ? `₹${product.rentPricePerDay.toLocaleString()}/day` : 'N/A';
    }
  }

  getImage(product: Product): string {
    return product.photos && product.photos.length > 0
      ? assetUrl(product.photos[0].replace(/\\/g, '/'))
      : 'assets/placeholder-product.jpg'; // fallback image
  }

  approveProduct(product: Product) {
    if (!confirm(`Approve "${product.name}"?`)) return;

    this.http.put(`${this.apiUrl}/${product._id}/status`, { status: 'approved' }).subscribe({
      next: () => {
        product.status = 'approved';
        alert('Product approved');
      },
      error: (err) => {
        alert(err.error?.msg || 'Failed to approve');
      }
    });
  }

  rejectProduct(product: Product) {
    if (!confirm(`Reject "${product.name}"?`)) return;

    this.http.put(`${this.apiUrl}/${product._id}/status`, { status: 'rejected' }).subscribe({
      next: () => {
        product.status = 'rejected';
        alert('Product rejected');
      },
      error: (err) => {
        alert(err.error?.msg || 'Failed to reject');
      }
    });
  }

  // Pagination methods
  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }
}
