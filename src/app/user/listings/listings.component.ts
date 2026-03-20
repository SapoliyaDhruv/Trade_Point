import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { apiUrl, assetUrl } from '../../shared/utils/url';

interface Product {
  _id: string;
  name: string;
  photos: string[];
  type: 'sale' | 'rent';
  salePriceMin?: number;
  salePriceMax?: number;
  rentPricePerDay?: number;
  category: { _id: string; name: string };
  status: 'pending' | 'approved' | 'rejected';
  isActive: boolean;
}

interface Category {
  _id: string;
  name: string;
}

@Component({
  selector: 'app-listings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './listings.component.html',
  styleUrls: ['./listings.component.css']
})
export class ListingsComponent implements OnInit {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  categories: Category[] = [];

  selectedStatus = '';
  selectedType = '';
  selectedCategory = '';
  searchTerm = '';

  currentPage = 1;
  pageSize = 10;
  totalPages = 1;

  isLoading = true;
  errorMsg = '';

  private apiUrl = apiUrl('/products/user');

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadCategories();
    this.loadProducts();
  }

  loadCategories() {
    this.http.get<Category[]>(apiUrl('/categories')).subscribe({
      next: (data) => {
        this.categories = data || [];
      },
      error: (err) => {
        console.error('Failed to load categories:', err);
      }
    });
  }

  loadProducts() {
    this.isLoading = true;
    this.errorMsg = '';

    this.http.get<Product[]>(this.apiUrl).subscribe({
      next: (data) => {
        this.products = data || [];
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMsg = err.error?.msg || 'Failed to load your listings';
        this.isLoading = false;
        console.error('Load listings error:', err);
      }
    });
  }

  applyFilters() {
    let filtered = this.products;

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(term));
    }

    if (this.selectedStatus) {
      filtered = filtered.filter(p => p.status === this.selectedStatus);
    }

    if (this.selectedType) {
      filtered = filtered.filter(p => p.type === this.selectedType);
    }

    if (this.selectedCategory) {
      filtered = filtered.filter(p => p.category?._id === this.selectedCategory);
    }

    this.filteredProducts = filtered;
    this.totalPages = Math.ceil(filtered.length / this.pageSize);
    this.currentPage = 1;
  }

  get displayedProducts(): Product[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredProducts.slice(start, start + this.pageSize);
  }

  getPrice(product: Product): string {
    if (product.status === 'approved' && !product.isActive) {
      return 'Paused';
    }
    if (product.type === 'sale') {
      if (product.salePriceMin && product.salePriceMax) {
        return `₹${product.salePriceMin.toLocaleString()} - ₹${product.salePriceMax.toLocaleString()}`;
      }
      return 'N/A';
    }
    return product.rentPricePerDay ? `₹${product.rentPricePerDay.toLocaleString()}/day` : 'N/A';
  }

  getImage(product: Product): string {
    return product.photos?.length > 0
      ? assetUrl(product.photos[0].replace(/\\/g, '/'))
      : 'assets/placeholder-product.jpg';
  }

  viewProduct(product: Product) {
    this.router.navigate(['/user/product', product._id]);
  }

  editProduct(product: Product) {
    if (product.status === 'approved' && !product.isActive) {
      alert('Cannot edit a paused product. Please activate it first.');
      return;
    }
    this.router.navigate(['/user/edit-product', product._id]);
  }

  toggleActive(product: Product) {
    if (product.status !== 'approved') {
      alert('Only approved products can be paused or activated.');
      return;
    }

    const action = product.isActive ? 'pause' : 'activate';
    if (!confirm(`Are you sure you want to ${action} "${product.name}"?\n\n${action === 'pause' ? 'It will be hidden from buyers.' : 'It will become visible again.'}`)) {
      return;
    }

    this.http.patch(`${this.apiUrl}/${product._id}/toggle-active`, {})
      .subscribe({
        next: (res: any) => {
          product.isActive = res.isActive;
          alert(res.msg || `Product successfully ${res.isActive ? 'activated' : 'paused'}!`);
        },
        error: (err) => {
          console.error('Toggle active failed:', err);
          alert(err.error?.msg || 'Failed to update product status. Please try again.');
        }
      });
  }

  resubmitProduct(product: Product) {
    // You can improve this later (e.g. open edit page with special flag)
    alert('Edit & Resubmit feature: Coming soon...\nFor now, please use Edit button if allowed.');
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }
}
