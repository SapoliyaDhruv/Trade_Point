import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { apiUrl, assetUrl } from '../../../shared/utils/url';

interface Product {
  _id: string;
  name: string;
  seller: { firstName: string; lastName: string };
  category: { _id: string; name: string };
  type: 'sale' | 'rent';
  salePriceMin?: number;
  salePriceMax?: number;
  rentPricePerDay?: number;
  photos: string[];
  status: string;
}

interface Category {
  _id: string;
  name: string;
}

@Component({
  selector: 'app-manage-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-products.component.html',
  styleUrls: ['./manage-products.component.css']
})
export class ManageProductsComponent implements OnInit {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  categories: Category[] = [];

  searchTerm = '';
  selectedCategory = '';

  currentPage = 1;
  pageSize = 10;
  totalPages = 1;

  isLoading = true;
  errorMsg = '';

  private apiUrl = apiUrl('/products/admin');

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
    this.http.get<Product[]>(`${this.apiUrl}/all`).subscribe({
      next: (data) => {
        this.products = data || [];
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Load products error:', err);
        this.errorMsg = err.error?.msg || 'Failed to load products. Please try again.';
        this.isLoading = false;
      }
    });
  }

  applyFilters() {
    let filtered = this.products;

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(term));
    }

    if (this.selectedCategory) {
      filtered = filtered.filter((p) => p.category?._id === this.selectedCategory);
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
    if (product.type === 'sale') {
      if (product.salePriceMin && product.salePriceMax) {
        return `Rs ${product.salePriceMin.toLocaleString()} - Rs ${product.salePriceMax.toLocaleString()}`;
      }
      return 'N/A';
    }
    return product.rentPricePerDay ? `Rs ${product.rentPricePerDay.toLocaleString()}/day` : 'N/A';
  }

  getImage(product: Product): string {
    if (!product.photos || product.photos.length === 0) {
      return 'assets/placeholder-product.jpg';
    }
    let path = product.photos[0].replace(/\\/g, '/');
    if (path.startsWith('./')) path = path.substring(2);
    return assetUrl(path);
  }

  deleteProduct(product: Product) {
    if (!confirm(`Are you sure you want to delete "${product.name}" permanently?`)) {
      return;
    }

    const originalProducts = [...this.products];
    this.products = this.products.filter((p) => p._id !== product._id);
    this.applyFilters();

    this.http.delete(`${this.apiUrl}/${product._id}`).subscribe({
      next: () => {
        alert('Product deleted successfully');
      },
      error: (err) => {
        this.products = originalProducts;
        this.applyFilters();
        console.error('Delete failed:', err);
        alert(err.error?.msg || 'Failed to delete product. Please try again.');
      }
    });
  }

  editProduct(product: Product) {
    this.router.navigate(['/admin/products/edit', product._id]);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }
}
