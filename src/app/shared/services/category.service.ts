import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../utils/url';

export interface Category {
  _id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private http = inject(HttpClient);
  private apiUrl = apiUrl('/categories');

  /**
   * Get all categories (usually filtered to active ones on client if needed)
   */
  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(this.apiUrl);
  }

  /**
   * Optional: convenience method if you always want only active
   */
  getActiveCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(this.apiUrl);
    // Note: filtering is done client-side below if backend doesn't filter
  }
}
