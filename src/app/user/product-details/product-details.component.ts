import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { OfferModalComponent } from '../offer-modal/offer-modal.component';
import { AuthService } from '../../auth/auth.service';
import { apiUrl, assetUrl } from '../../shared/utils/url';

interface Product {
  _id: string;
  name: string;
  photos: string[];
  category: { _id: string; name: string };
  location: string;
  ageYears: number;
  description: string;
  type: 'sale' | 'rent';
  salePriceMin?: number;
  salePriceMax?: number;
  rentPricePerHour?: number;
  rentPricePerDay?: number;
  latePenaltyPerDay?: number;
  seller?: {
    firstName: string;
    lastName: string;
  };
  status: string;
  isActive: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [
    CommonModule,
  ],
  templateUrl: './product-details.component.html',
  styleUrls: ['./product-details.component.css']
})
export class ProductDetailsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private router = inject(Router);
  public dialog = inject(MatDialog);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);

  private apiUrl = apiUrl('/products');

  product = signal<Product | null>(null);
  isLoading = signal(true);
  errorMsg = signal<string>('');
  mainImageUrl = signal<string>('assets/placeholder-product.jpg');
  inWishlist = signal(false);

  hasMultiplePhotos = computed(() => {
    return (this.product()?.photos?.length ?? 0) > 1;
  });

  isOfferable = computed(() => {
    const prod = this.product();
    return prod?.status === 'approved' && prod?.isActive === true;
  });

  ngOnInit(): void {
    if (this.authService.token && !this.authService.currentUserSnapshot) {
      this.authService.fetchCurrentUser().subscribe({ error: () => {} });
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadProduct(id);
    } else {
      this.errorMsg.set('Product not found');
      this.isLoading.set(false);
    }
  }

  loadProduct(id: string): void {
    this.http.get<Product>(`${this.apiUrl}/${id}`).subscribe({
      next: (data) => {
        this.product.set(data);
        if (data.photos?.length) {
          this.mainImageUrl.set(this.getCleanImageUrl(data.photos[0]));
        }
        if (this.isLoggedIn()) {
          this.trackRecentlyViewed(data._id);
          this.syncWishlistStatus(data._id);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMsg.set('Failed to load product');
        this.isLoading.set(false);
      }
    });
  }

  goBack(): void {
    this.router.navigate([this.getBrowseRoute()]);
  }

  goToLogin(): void {
    if (!this.isLoggedIn()) {
      this.router.navigate(['/login']);
    }
  }

  openOfferModal(): void {
    const prod = this.product();
    if (!prod || !this.isOfferable() || !this.canMakeOffer()) {
      this.goToLogin();
      return;
    }

    this.dialog.open(OfferModalComponent, {
      width: '500px',
      maxWidth: '90vw',
      panelClass: 'tp-offer-dialog',
      data: { product: prod }
    });
  }

  toggleWishlist(): void {
    if (!this.canUseWishlist()) {
      this.goToLogin();
      return;
    }

    const prod = this.product();
    if (!prod) return;

    const endpoint = apiUrl(`/users/wishlist/${prod._id}`);
    if (this.inWishlist()) {
      this.http.delete(endpoint).subscribe({
        next: () => this.inWishlist.set(false)
      });
      return;
    }

    this.http.post(endpoint, {}).subscribe({
      next: () => this.inWishlist.set(true)
    });
  }

  getCleanImageUrl(path?: string): string {
    if (!path) return 'assets/placeholder-product.jpg';
    return assetUrl(path.replace(/\\/g, '/'));
  }

  setMainImage(path: string): void {
    const cleanUrl = this.getCleanImageUrl(path);
    this.mainImageUrl.set(cleanUrl);
  }

  getFallbackImage(): string {
    return 'assets/placeholder-product.jpg';
  }

  handleImageError(event: Event): void {
    (event.target as HTMLImageElement).src = this.getFallbackImage();
  }

  canMakeOffer(): boolean {
    return this.isOfferable() && this.isLoggedIn() && this.isUserRole();
  }

  canUseWishlist(): boolean {
    return this.isLoggedIn() && this.isUserRole();
  }

  isLoggedIn(): boolean {
    return !!this.authService.token;
  }

  isUserRole(): boolean {
    const role = this.authService.role || this.getStoredRole();
    return role === 'user';
  }

  offerHint(): string {
    if (this.canMakeOffer()) {
      return 'Seller will review your offer and respond.';
    }
    if (!this.isLoggedIn()) {
      return 'Login to make an offer on this product.';
    }
    if (!this.isUserRole()) {
      return 'Only buyer accounts can send offers.';
    }
    return '';
  }

  wishlistHint(): string {
    if (this.canUseWishlist()) {
      return '';
    }
    if (!this.isLoggedIn()) {
      return 'Login to save products to your wishlist.';
    }
    return 'Only buyer accounts can save wishlist items.';
  }

  private trackRecentlyViewed(productId: string): void {
    this.http.post(apiUrl(`/users/recently-viewed/${productId}`), {}).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  private syncWishlistStatus(productId: string): void {
    if (!this.canUseWishlist()) {
      this.inWishlist.set(false);
      return;
    }

    this.http.get<any[]>(apiUrl('/users/wishlist')).subscribe({
      next: (items) => {
        const found = (items || []).some((item) => String(item._id) === String(productId));
        this.inWishlist.set(found);
      },
      error: () => {
        this.inWishlist.set(false);
      }
    });
  }

  private getStoredRole(): string | null {
    return isPlatformBrowser(this.platformId) ? localStorage.getItem('role') : null;
  }

  private getBrowseRoute(): string {
    return this.router.url.startsWith('/user/') ? '/user/browse-products' : '/browse';
  }
}
