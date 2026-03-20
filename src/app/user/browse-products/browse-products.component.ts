import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { apiUrl, assetUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-browse-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './browse-products.component.html',
  styleUrls: ['./browse-products.component.css']
})
export class BrowseProductsComponent implements OnInit {
  products: any[] = [];
  categories: any[] = [];
  wishlist = new Set<string>();

  q = '';
  selectedCategory = '';
  selectedType = '';
  location = '';
  minPrice = '';
  maxPrice = '';
  minAge = '';
  maxAge = '';
  sort = 'newest';

  isLoading = true;
  page = 1;
  limit = 12;
  total = 0;
  totalPages = 1;

  private apiUrl = apiUrl('/products');

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadWishlist();
    this.route.queryParams.subscribe((params) => {
      this.q = (params['q'] || '').toString();
      this.selectedCategory = (params['category'] || '').toString();
      this.selectedType = (params['type'] || '').toString();
      this.loadProducts(true);
    });
  }

  loadCategories(): void {
    this.http.get<any[]>(apiUrl('/categories')).subscribe({
      next: (cats) => {
        this.categories = (cats || []).filter((c) => c.status === 'active');
      }
    });
  }

  loadWishlist(): void {
    this.http.get<any[]>(apiUrl('/users/wishlist')).subscribe({
      next: (items) => {
        this.wishlist = new Set((items || []).map((item) => String(item._id)));
      },
      error: () => {
        this.wishlist = new Set();
      }
    });
  }

  loadProducts(resetPage = false): void {
    if (resetPage) {
      this.page = 1;
    }

    this.isLoading = true;

    let params = new HttpParams()
      .set('q', this.q.trim())
      .set('category', this.selectedCategory)
      .set('type', this.selectedType)
      .set('location', this.location.trim())
      .set('minPrice', this.minPrice)
      .set('maxPrice', this.maxPrice)
      .set('minAge', this.minAge)
      .set('maxAge', this.maxAge)
      .set('sort', this.sort)
      .set('page', this.page)
      .set('limit', this.limit);

    this.http.get<any>(`${this.apiUrl}/approved`, { params }).subscribe({
      next: (res) => {
        if (Array.isArray(res)) {
          this.products = res;
          this.total = res.length;
          this.totalPages = 1;
        } else {
          this.products = res?.items || [];
          this.total = Number(res?.total || 0);
          this.totalPages = Number(res?.totalPages || 1);
          this.page = Number(res?.page || this.page);
        }
        this.isLoading = false;
      },
      error: () => {
        this.products = [];
        this.total = 0;
        this.totalPages = 1;
        this.isLoading = false;
      }
    });
  }

  clearFilters(): void {
    this.q = '';
    this.selectedCategory = '';
    this.selectedType = '';
    this.location = '';
    this.minPrice = '';
    this.maxPrice = '';
    this.minAge = '';
    this.maxAge = '';
    this.sort = 'newest';
    this.loadProducts(true);
  }

  goToPage(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.totalPages || nextPage === this.page) {
      return;
    }
    this.page = nextPage;
    this.loadProducts(false);
  }

  openProduct(id: string): void {
    const base = this.router.url.startsWith('/user/') ? '/user/product' : '/product';
    this.router.navigate([base, id]);
  }

  isWishlisted(productId: string): boolean {
    return this.wishlist.has(String(productId));
  }

  toggleWishlist(event: Event, productId: string): void {
    event.stopPropagation();
    const id = String(productId);

    if (this.wishlist.has(id)) {
      this.http.delete(apiUrl(`/users/wishlist/${id}`)).subscribe({
        next: () => {
          this.wishlist.delete(id);
        }
      });
      return;
    }

    this.http.post(apiUrl(`/users/wishlist/${id}`), {}).subscribe({
      next: () => {
        this.wishlist.add(id);
      }
    });
  }

  getCleanImageUrl(path?: string): string {
    if (!path) return 'assets/placeholder-product.jpg';
    const cleanPath = path.replace(/\\/g, '/').replace(/^public\//, '');
    return assetUrl(cleanPath);
  }

  handleImageError(event: Event): void {
    (event.target as HTMLImageElement).src = 'assets/placeholder-product.jpg';
  }
}
