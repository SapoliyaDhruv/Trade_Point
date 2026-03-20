import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../auth/auth.service';
import { apiUrl } from '../../shared/utils/url';

@Injectable({ providedIn: 'root' })
export class AdminCategoryService {
  private http = inject(HttpClient);
  private API = apiUrl('/categories');

  addCategory(data: { name: string }) {
    return this.http.post(this.API, data);
  }

  getCategories() {
    return this.http.get<any[]>(this.API);
  }

  updateCategory(id: string, data: any) {
    return this.http.put(`${this.API}/${id}`, data);
  }

  toggleStatus(id: string, status: 'active' | 'inactive') {
    return this.http.put(`${this.API}/${id}`, { status });
  }
}
