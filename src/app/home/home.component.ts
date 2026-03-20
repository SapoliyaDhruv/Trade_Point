import { Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpClientModule, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { apiUrl, assetUrl } from '../shared/utils/url';

interface Product {
  _id: string;
  name: string;
  photos?: string[];
  type: 'sale' | 'rent';
  salePriceMin?: number;
  salePriceMax?: number;
  rentPricePerDay?: number;
  location?: string;
  category?: { _id: string; name: string };
}

interface Category {
  _id: string;
  name: string;
  status: 'active' | 'inactive';
}

interface TrendingCategory {
  _id: string;
  name: string;
  count: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);

  steps = [
    { title: 'Sign Up', subtitle: 'Create an account in seconds', image: 'image1signup.png' },
    { title: 'Post Or Browse', subtitle: 'List your item or find one nearby', image: 'image2post.png' },
    { title: 'Deal Safely', subtitle: 'Secure payments and verified users', image: 'imageearn.png' }
  ];

  highlights = [
    { title: 'Verified Users', description: 'Email-verified accounts reduce fake listings.' },
    { title: 'Rent Or Buy', description: 'One platform for selling, renting, and negotiating.' },
    { title: 'Transparent Fees', description: 'Clear platform fee and owner payout flow.' }
  ];

  featuredProducts: Product[] = [];
  trendingCategories: TrendingCategory[] = [];
  skeletonItems = Array.from({ length: 4 }, (_, index) => index);
  isLoadingFeatured = true;
  isLoadingCategories = true;
  featuredError = '';
  categoriesError = '';

  constructor(private router: Router) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.loadFeaturedProducts();
    this.loadTrendingCategories();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  goToSignup(): void {
    this.router.navigate(['/register']);
  }

  goToBrowse(): void {
    this.router.navigate(['/browse']);
  }

  viewProduct(product: Product): void {
    if (!product?._id) return;
    this.router.navigate(['/product', product._id]);
  }

  browseCategory(category: TrendingCategory): void {
    if (!category?._id) {
      this.goToBrowse();
      return;
    }
    this.router.navigate(['/browse'], {
      queryParams: { category: category._id }
    });
  }

  getPrice(product: Product): string {
    if (product.type === 'sale') {
      if (product.salePriceMin && product.salePriceMax) {
        return `Rs ${product.salePriceMin.toLocaleString()} - Rs ${product.salePriceMax.toLocaleString()}`;
      }
      return 'Price on request';
    }
    return product.rentPricePerDay
      ? `Rs ${product.rentPricePerDay.toLocaleString()}/day`
      : 'Rent on request';
  }

  getImage(product: Product): string {
    const path = product.photos?.[0];
    if (!path) return 'assets/placeholder-product.jpg';
    const cleanPath = path.replace(/\\/g, '/').replace(/^public\//, '');
    return assetUrl(cleanPath);
  }

  handleImageError(event: Event): void {
    (event.target as HTMLImageElement).src = 'assets/placeholder-product.jpg';
  }

  getCategoryName(product: Product): string {
    return product.category?.name || 'Category';
  }

  private loadFeaturedProducts(): void {
    this.isLoadingFeatured = true;
    this.featuredError = '';

    const params = new HttpParams()
      .set('sort', 'newest')
      .set('limit', '4');

    this.http.get<any>(apiUrl('/products/approved'), { params }).subscribe({
      next: (res) => {
        const items = this.extractItems(res);
        this.featuredProducts = items.slice(0, 4);
        this.isLoadingFeatured = false;
      },
      error: () => {
        this.featuredProducts = [];
        this.isLoadingFeatured = false;
        this.featuredError = 'Failed to load featured products.';
      }
    });
  }

  private loadTrendingCategories(): void {
    this.isLoadingCategories = true;
    this.categoriesError = '';

    this.http.get<Category[]>(apiUrl('/categories')).subscribe({
      next: (cats) => {
        const active = (cats || []).filter((cat) => cat.status === 'active');
        const nameById = new Map(active.map((cat) => [String(cat._id), cat.name]));

        const params = new HttpParams()
          .set('sort', 'newest')
          .set('limit', '200');

        this.http.get<any>(apiUrl('/products/approved'), { params }).subscribe({
          next: (res) => {
            const items = this.extractItems(res);
            const counts = new Map<string, TrendingCategory>();

            for (const item of items) {
              const catObj = item.category;
              const catId = String(catObj?._id || catObj || '');
              const name = catObj?.name || nameById.get(catId);
              if (!catId || !name) continue;

              const entry = counts.get(catId) || { _id: catId, name, count: 0 };
              entry.count += 1;
              counts.set(catId, entry);
            }

            const ranked = Array.from(counts.values()).sort((a, b) => b.count - a.count);
            this.trendingCategories = ranked.slice(0, 4);

            if (!this.trendingCategories.length) {
              this.trendingCategories = active.slice(0, 4).map((cat) => ({
                _id: cat._id,
                name: cat.name,
                count: 0
              }));
            }

            this.isLoadingCategories = false;
          },
          error: () => {
            this.trendingCategories = active.slice(0, 4).map((cat) => ({
              _id: cat._id,
              name: cat.name,
              count: 0
            }));
            this.isLoadingCategories = false;
            this.categoriesError = 'Failed to load trending categories.';
          }
        });
      },
      error: () => {
        this.trendingCategories = [];
        this.isLoadingCategories = false;
        this.categoriesError = 'Failed to load categories.';
      }
    });
  }

  private extractItems(res: any): any[] {
    return Array.isArray(res) ? res : res?.items || [];
  }
}
