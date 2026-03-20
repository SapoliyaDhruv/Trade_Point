import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminUserService } from '../services/admin-user.service';

@Component({
  selector: 'app-admin-manage-users',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-manage-users.component.html',
  styleUrls: ['./admin-manage-users.component.css']
})
export class AdminManageUsersComponent implements OnInit {

  users: any[] = [];
  loading = true;

  constructor(private adminService: AdminUserService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers() {
    console.log('Loading users...');

    this.adminService.getAllUsers().subscribe({
      next: (res) => {
        console.log('Users loaded:', res);
        this.users = res || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load users', err);
        this.loading = false;
      }
    });
  }

  toggleRole(user: any) {
    const newRole = user.role === 'admin' ? 'user' : 'admin';

    this.adminService.updateRole(user._id, newRole).subscribe({
      next: () => {
        user.role = newRole;
      },
      error: err => console.error('Role update failed', err)
    });
  }
}
