import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { apiUrl } from '../../shared/utils/url';

@Injectable({ providedIn: 'root' })
export class AdminUserService {

  private http = inject(HttpClient);
  private API = apiUrl('/admin');

  getAllUsers() {
    return this.http.get<any[]>(`${this.API}/users`);
  }

  updateRole(userId: string, role: string) {
    return this.http.put(
      `${this.API}/users/${userId}/role`,
      { role }
    );
  }
}
